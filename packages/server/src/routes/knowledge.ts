import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'
import { importKnowledgeEntries, syncKnowledgeToAI, searchKnowledge, getEmbeddingStats } from '../services/knowledge.service.js'
import { embedAllKnowledgeEntries, embedKnowledgeEntry } from '../services/embedding.service.js'
import {
  convertToMarkdown,
  saveKnowledgeFile,
  listKnowledgeFiles,
  readKnowledgeFile,
  deleteKnowledgeFile,
  parseKnowledgeEntries,
  SUPPORTED_EXTENSIONS,
} from '../services/file-converter.service.js'
import { processDocumentToKnowledge } from '../services/document-processor.service.js'
import { getSettings } from '../services/settings.service.js'
import { checkFeishuConnection, fetchWikiSpaceNodes, fetchWikiDocument } from '../services/feishu.service.js'

const createEntrySchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
  keywords: z.array(z.string()).optional(),
})

const updateEntrySchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

const importSchema = z.object({
  entries: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    category: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  })),
})

const syncSchema = z.object({
  ids: z.array(z.number()).optional(),
})

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        category?: string
        isActive?: string
        isSyncedToAI?: string
        search?: string
        source?: string
      }

      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)
      const { category, isActive, isSyncedToAI, search, source } = query

      const where: Record<string, unknown> = {}
      if (category) where.category = category
      if (isActive !== undefined) where.isActive = isActive === 'true'
      if (isSyncedToAI !== undefined) where.isSyncedToAI = isSyncedToAI === 'true'
      if (source) where.source = source
      if (search) {
        where.OR = [
          { question: { contains: search, mode: 'insensitive' } },
          { answer: { contains: search, mode: 'insensitive' } },
          { keywords: { has: search } },
        ]
      }

      const [entries, total] = await Promise.all([
        prisma.knowledgeEntry.findMany({
          where,
          include: { createdBy: { select: { id: true, displayName: true, username: true } } },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.knowledgeEntry.count({ where }),
      ])

      return {
        success: true,
        data: entries,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }
  )

  // 取得分類列表
  app.get(
    '/categories',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async () => {
      const categories = await prisma.knowledgeEntry.groupBy({
        by: ['category'],
        where: { category: { not: null } },
        _count: true,
      })

      return {
        success: true,
        data: categories.map(c => ({ name: c.category, count: c._count })),
      }
    }
  )

  // 測試知識庫搜尋
  app.post(
    '/search',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async (request) => {
      const { query } = request.body as { query: string }

      if (!query) {
        return { success: false, error: { code: 'INVALID_QUERY', message: '請提供查詢內容' } }
      }

      try {
        const result = await searchKnowledge(query)

        if (result) {
          return {
            success: true,
            data: {
              matched: true,
              question: result.entry.question,
              answer: result.generatedAnswer || result.entry.answer,
              sourceAnswer: result.entry.answer,
              confidence: result.confidence,
              category: result.entry.category,
              isGenerated: result.isGenerated,  // 使用實際的 AI 生成標記
            },
          }
        } else {
          return {
            success: true,
            data: {
              matched: false,
              message: '沒有找到匹配的知識條目',
            },
          }
        }
      } catch (err) {
        return {
          success: false,
          error: { code: 'SEARCH_ERROR', message: err instanceof Error ? err.message : '搜尋失敗' },
        }
      }
    }
  )

  // 統計
  app.get(
    '/stats',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async () => {
      const [total, active, synced, totalUsage, embeddingStats] = await Promise.all([
        prisma.knowledgeEntry.count(),
        prisma.knowledgeEntry.count({ where: { isActive: true } }),
        prisma.knowledgeEntry.count({ where: { isSyncedToAI: true } }),
        prisma.knowledgeEntry.aggregate({ _sum: { usageCount: true } }),
        getEmbeddingStats(),
      ])

      // 自動回覆統計
      const [totalReplies, matchedReplies, todayReplies] = await Promise.all([
        prisma.autoReplyLog.count(),
        prisma.autoReplyLog.count({ where: { matched: true } }),
        prisma.autoReplyLog.count({
          where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        }),
      ])

      return {
        success: true,
        data: {
          total,
          active,
          synced,
          notSynced: active - synced,
          totalUsage: totalUsage._sum.usageCount || 0,
          embedding: embeddingStats,
          autoReply: {
            total: totalReplies,
            matched: matchedReplies,
            notMatched: totalReplies - matchedReplies,
            today: todayReplies,
            matchRate: totalReplies > 0 ? Math.round((matchedReplies / totalReplies) * 100) : 0,
          },
        },
      }
    }
  )

  // 生成所有條目的 Embedding
  app.post(
    '/embed-all',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request) => {
      const { force } = request.body as { force?: boolean }

      const results = await embedAllKnowledgeEntries({ force: force || false })

      await createLog({
        entityType: 'knowledge',
        action: 'embed_all',
        details: results,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: results }
    }
  )

  // 生成單個條目的 Embedding
  app.post(
    '/:id/embed',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const entryId = parseInt(id, 10)

      const success = await embedKnowledgeEntry(entryId)

      if (!success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'EMBED_FAILED', message: '無法生成 Embedding' },
        })
      }

      await createLog({
        entityType: 'knowledge',
        entityId: entryId,
        action: 'embed',
        details: { success },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { embedded: true } }
    }
  )

  // 詳情
  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const entry = await prisma.knowledgeEntry.findUnique({
        where: { id: parseInt(id) },
        include: { createdBy: { select: { id: true, displayName: true, username: true } } },
      })

      if (!entry) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '知識庫條目不存在' },
        })
      }

      return { success: true, data: entry }
    }
  )

  // 新增
  app.post(
    '/',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request) => {
      const data = createEntrySchema.parse(request.body)

      const entry = await prisma.knowledgeEntry.create({
        data: {
          ...data,
          keywords: data.keywords || [],
          createdById: request.user.id,
        },
      })

      await createLog({
        entityType: 'knowledge',
        entityId: entry.id,
        action: 'create',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: entry }
    }
  )

  // 更新
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('knowledge.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const data = updateEntrySchema.parse(request.body)

      const existing = await prisma.knowledgeEntry.findUnique({
        where: { id: parseInt(id) },
      })

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '知識庫條目不存在' },
        })
      }

      // 如果內容有變更，標記為未同步
      const contentChanged = data.question !== undefined || data.answer !== undefined || data.keywords !== undefined
      const updateData = {
        ...data,
        isSyncedToAI: contentChanged ? false : existing.isSyncedToAI,
      }

      const entry = await prisma.knowledgeEntry.update({
        where: { id: parseInt(id) },
        data: updateData,
      })

      await createLog({
        entityType: 'knowledge',
        entityId: entry.id,
        action: 'update',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: entry }
    }
  )

  // 刪除
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('knowledge.delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const existing = await prisma.knowledgeEntry.findUnique({
        where: { id: parseInt(id) },
      })

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '知識庫條目不存在' },
        })
      }

      await prisma.knowledgeEntry.delete({ where: { id: parseInt(id) } })

      await createLog({
        entityType: 'knowledge',
        entityId: parseInt(id),
        action: 'delete',
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )

  // 批量刪除
  app.post(
    '/batch-delete',
    { preHandler: [authenticate, requirePermission('knowledge.delete')] },
    async (request) => {
      const { ids } = request.body as { ids: number[] }

      if (!ids || ids.length === 0) {
        return { success: false, error: { code: 'INVALID_IDS', message: '請選擇要刪除的條目' } }
      }

      const result = await prisma.knowledgeEntry.deleteMany({
        where: { id: { in: ids } },
      })

      await createLog({
        entityType: 'knowledge',
        action: 'batch_delete',
        details: { ids, count: result.count },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { deleted: result.count } }
    }
  )

  // 批量導入
  app.post(
    '/import',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request) => {
      const { entries } = importSchema.parse(request.body)

      const results = await importKnowledgeEntries(entries, request.user.id)

      await createLog({
        entityType: 'knowledge',
        action: 'import',
        details: { count: entries.length, results },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: results }
    }
  )

  // 同步到 AI
  app.post(
    '/sync',
    { preHandler: [authenticate, requirePermission('knowledge.edit')] },
    async (request) => {
      const { ids } = syncSchema.parse(request.body)

      const results = await syncKnowledgeToAI(ids)

      await createLog({
        entityType: 'knowledge',
        action: 'sync',
        details: { ids, results },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: results }
    }
  )

  // 自動回覆記錄
  app.get(
    '/auto-reply-logs',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        matched?: string
      }

      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)
      const { matched } = query

      const where: Record<string, unknown> = {}
      if (matched !== undefined) where.matched = matched === 'true'

      const [logs, total] = await Promise.all([
        prisma.autoReplyLog.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.autoReplyLog.count({ where }),
      ])

      return {
        success: true,
        data: logs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }
  )

  // ==================== 文件上傳相關 API ====================

  // 取得支援的文件類型
  app.get(
    '/files/supported-types',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async () => {
      return {
        success: true,
        data: {
          extensions: SUPPORTED_EXTENSIONS,
          mimeTypes: [
            'text/markdown',
            'text/plain',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
          ],
        },
      }
    }
  )

  // 上傳並轉換文件
  app.post(
    '/files/upload',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request, reply) => {
      const data = await request.file()

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: '請選擇文件' },
        })
      }

      const filename = data.filename
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()

      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TYPE', message: `不支援的文件類型: ${ext}，支援: ${SUPPORTED_EXTENSIONS.join(', ')}` },
        })
      }

      // 讀取文件內容
      const chunks: Buffer[] = []
      for await (const chunk of data.file) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      // 轉換為 Markdown
      const { content, error } = await convertToMarkdown(buffer, filename, data.mimetype)

      if (error) {
        return reply.status(400).send({
          success: false,
          error: { code: 'CONVERT_ERROR', message: error },
        })
      }

      // 保存轉換後的文件
      const saveResult = await saveKnowledgeFile(filename, content)

      if (saveResult.error) {
        return reply.status(500).send({
          success: false,
          error: { code: 'SAVE_ERROR', message: saveResult.error },
        })
      }

      // 解析知識條目
      const entries = parseKnowledgeEntries(content)

      await createLog({
        entityType: 'knowledge',
        action: 'upload',
        details: { filename, entries: entries.length },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: true,
        data: {
          filename: saveResult.path.split('/').pop(),
          originalName: filename,
          contentLength: content.length,
          entriesFound: entries.length,
          preview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
          entries: entries.slice(0, 10), // 預覽前10條
        },
      }
    }
  )

  // 列出已上傳的文件
  app.get(
    '/files',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async () => {
      const { files } = await listKnowledgeFiles()

      return {
        success: true,
        data: files.map(f => ({
          name: f.name,
          size: f.size,
          createdAt: f.createdAt,
          modifiedAt: f.modifiedAt,
        })),
      }
    }
  )

  // 讀取文件內容
  app.get(
    '/files/:filename',
    { preHandler: [authenticate, requirePermission('knowledge.view')] },
    async (request, reply) => {
      const { filename } = request.params as { filename: string }

      // 安全檢查：防止路徑遍歷攻擊
      if (filename.includes('..') || filename.includes('/')) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_FILENAME', message: '無效的文件名' },
        })
      }

      const { content, error } = await readKnowledgeFile(filename)

      if (error) {
        return reply.status(404).send({
          success: false,
          error: { code: 'READ_ERROR', message: error },
        })
      }

      // 解析知識條目
      const entries = parseKnowledgeEntries(content)

      return {
        success: true,
        data: {
          filename,
          content,
          entriesFound: entries.length,
          entries,
        },
      }
    }
  )

  // 刪除文件
  app.delete(
    '/files/:filename',
    { preHandler: [authenticate, requirePermission('knowledge.delete')] },
    async (request, reply) => {
      const { filename } = request.params as { filename: string }

      // 安全檢查
      if (filename.includes('..') || filename.includes('/')) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_FILENAME', message: '無效的文件名' },
        })
      }

      const { success, error } = await deleteKnowledgeFile(filename)

      if (!success) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DELETE_ERROR', message: error },
        })
      }

      await createLog({
        entityType: 'knowledge',
        action: 'delete_file',
        details: { filename },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )

  // 清空所有文件
  app.delete(
    '/files',
    { preHandler: [authenticate, requirePermission('knowledge.delete')] },
    async (request) => {
      const { files } = await listKnowledgeFiles()

      let deleted = 0
      const errors: string[] = []

      for (const file of files) {
        const { success, error } = await deleteKnowledgeFile(file.name)
        if (success) {
          deleted++
        } else {
          errors.push(`${file.name}: ${error}`)
        }
      }

      await createLog({
        entityType: 'knowledge',
        action: 'clear_all_files',
        details: { deleted, errors: errors.length },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: true,
        data: { deleted, errors },
      }
    }
  )

  // 從文件導入知識條目到數據庫
  app.post(
    '/files/:filename/import',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request, reply) => {
      const { filename } = request.params as { filename: string }
      const { category } = (request.body as { category?: string }) || {}

      // 安全檢查
      if (filename.includes('..') || filename.includes('/')) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_FILENAME', message: '無效的文件名' },
        })
      }

      const { content, error } = await readKnowledgeFile(filename)

      if (error) {
        return reply.status(404).send({
          success: false,
          error: { code: 'READ_ERROR', message: error },
        })
      }

      // 解析知識條目
      const entries = parseKnowledgeEntries(content)

      if (entries.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_ENTRIES', message: '無法從文件中解析出知識條目，請確認文件格式' },
        })
      }

      // 如果指定了分類，為所有條目添加分類
      const entriesToImport = category
        ? entries.map(e => ({ ...e, category }))
        : entries

      // 導入到數據庫
      const results = await importKnowledgeEntries(entriesToImport, request.user.id)

      await createLog({
        entityType: 'knowledge',
        action: 'import_from_file',
        details: { filename, category, results },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: true,
        data: {
          ...results,
          total: entries.length,
        },
      }
    }
  )

  // 批量從多個文件導入知識條目
  app.post(
    '/files/batch-import',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request) => {
      const { filenames, category } = request.body as { filenames?: string[]; category?: string }

      // 如果沒有指定文件，則導入所有文件
      let filesToImport: string[] = []
      if (filenames && filenames.length > 0) {
        // 安全檢查
        for (const filename of filenames) {
          if (filename.includes('..') || filename.includes('/')) {
            continue // 跳過無效文件名
          }
          filesToImport.push(filename)
        }
      } else {
        // 獲取所有文件
        const { files } = await listKnowledgeFiles()
        filesToImport = files.map(f => f.name)
      }

      if (filesToImport.length === 0) {
        return {
          success: false,
          error: { code: 'NO_FILES', message: '沒有可導入的文件' },
        }
      }

      let totalCreated = 0
      let totalUpdated = 0
      let totalEntries = 0
      const errors: string[] = []
      const importedFiles: string[] = []

      for (const filename of filesToImport) {
        try {
          const { content, error } = await readKnowledgeFile(filename)
          if (error) {
            errors.push(`${filename}: ${error}`)
            continue
          }

          const entries = parseKnowledgeEntries(content)
          if (entries.length === 0) {
            errors.push(`${filename}: 無法解析出知識條目`)
            continue
          }

          const entriesToImport = category
            ? entries.map(e => ({ ...e, category }))
            : entries

          const results = await importKnowledgeEntries(entriesToImport, request.user.id)
          totalCreated += results.created
          totalUpdated += results.updated
          totalEntries += entries.length
          importedFiles.push(filename)

          if (results.errors.length > 0) {
            errors.push(`${filename}: ${results.errors.join(', ')}`)
          }
        } catch (err) {
          errors.push(`${filename}: ${err instanceof Error ? err.message : '未知錯誤'}`)
        }
      }

      await createLog({
        entityType: 'knowledge',
        action: 'batch_import_from_files',
        details: {
          filenames: importedFiles,
          category,
          created: totalCreated,
          updated: totalUpdated,
          total: totalEntries,
          errors: errors.length,
        },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: true,
        data: {
          created: totalCreated,
          updated: totalUpdated,
          total: totalEntries,
          filesProcessed: importedFiles.length,
          errors,
        },
      }
    }
  )

  // ==================== AI 智能處理 API ====================

  // 使用 AI 智能處理上傳的文件
  // 這會自動將文檔拆分為 Q&A 對並存入知識庫
  app.post(
    '/files/ai-process',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request, reply) => {
      const data = await request.file()

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: '請選擇文件' },
        })
      }

      const filename = data.filename
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()

      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TYPE', message: `不支援的文件類型: ${ext}` },
        })
      }

      // 讀取文件內容
      const chunks: Buffer[] = []
      for await (const chunk of data.file) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      // 轉換為 Markdown
      const { content, error } = await convertToMarkdown(buffer, filename, data.mimetype)

      if (error) {
        return reply.status(400).send({
          success: false,
          error: { code: 'CONVERT_ERROR', message: error },
        })
      }

      // 使用 AI 處理文檔
      console.log(`Processing document ${filename} with AI...`)
      const result = await processDocumentToKnowledge(content, filename)

      await createLog({
        entityType: 'knowledge',
        action: 'ai_process',
        details: {
          filename,
          totalQAs: result.totalQAs,
          created: result.created,
          updated: result.updated,
          errors: result.errors.length,
        },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: result.success,
        data: {
          filename,
          totalQAs: result.totalQAs,
          created: result.created,
          updated: result.updated,
          errors: result.errors,
        },
      }
    }
  )

  // 使用 AI 重新處理已存在的文件
  app.post(
    '/files/:filename/ai-process',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request, reply) => {
      const { filename } = request.params as { filename: string }

      // 安全檢查
      if (filename.includes('..') || filename.includes('/')) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_FILENAME', message: '無效的文件名' },
        })
      }

      const { content, error } = await readKnowledgeFile(filename)

      if (error) {
        return reply.status(404).send({
          success: false,
          error: { code: 'READ_ERROR', message: error },
        })
      }

      // 使用 AI 處理文檔
      console.log(`Reprocessing document ${filename} with AI...`)
      const result = await processDocumentToKnowledge(content, filename)

      await createLog({
        entityType: 'knowledge',
        action: 'ai_reprocess',
        details: {
          filename,
          totalQAs: result.totalQAs,
          created: result.created,
          updated: result.updated,
          errors: result.errors.length,
        },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: result.success,
        data: {
          filename,
          totalQAs: result.totalQAs,
          created: result.created,
          updated: result.updated,
          errors: result.errors,
        },
      }
    }
  )

  // 從飛書知識庫同步
  app.post(
    '/sync-feishu',
    { preHandler: [authenticate, requirePermission('knowledge.create')] },
    async (request, reply) => {
      const settings = await getSettings()

      // 獲取配置的 space ID
      const wikiSpaceId = settings['feishu.wikiSpaceId']
      if (!wikiSpaceId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_SPACE_ID', message: '請先在系統設定中配置飛書知識空間 ID' },
        })
      }

      // 檢查飛書連接
      const feishuStatus = await checkFeishuConnection()
      if (!feishuStatus.connected) {
        return reply.status(400).send({
          success: false,
          error: { code: 'FEISHU_NOT_CONNECTED', message: '飛書未連接，請先在系統設定中配置飛書應用' },
        })
      }

      const errors: string[] = []
      let created = 0
      let updated = 0

      try {
        // 獲取知識空間的所有節點
        const nodeToken = settings['feishu.wikiNodeToken']
        const nodes = await fetchWikiSpaceNodes(wikiSpaceId, nodeToken)

        if (!nodes || nodes.length === 0) {
          return {
            success: true,
            data: { created: 0, updated: 0, errors: ['知識空間中沒有找到文檔節點'] },
          }
        }

        // 遍歷每個文檔節點，獲取內容
        for (const node of nodes) {
          try {
            if (node.obj_type !== 'doc' && node.obj_type !== 'docx') {
              continue // 只處理文檔類型
            }

            const docContent = await fetchWikiDocument(node.obj_token)
            if (!docContent) {
              errors.push(`無法獲取文檔內容: ${node.title}`)
              continue
            }

            // 解析文檔內容，提取 Q&A 格式
            const qaEntries = parseQAFromDocument(docContent, node.title)

            if (qaEntries.length === 0) {
              // 如果沒有 Q&A 格式，將整個文檔作為一個知識條目
              const existing = await prisma.knowledgeEntry.findFirst({
                where: { question: node.title },
              })

              if (existing) {
                await prisma.knowledgeEntry.update({
                  where: { id: existing.id },
                  data: {
                    answer: docContent,
                    category: '飛書同步',
                    source: 'FEISHU_SYNC',
                    sourceRef: node.obj_token,
                    updatedAt: new Date(),
                  },
                })
                updated++
              } else {
                await prisma.knowledgeEntry.create({
                  data: {
                    question: node.title,
                    answer: docContent,
                    category: '飛書同步',
                    keywords: [],
                    source: 'FEISHU_SYNC',
                    sourceRef: node.obj_token,
                    isActive: true,
                    isSyncedToAI: false,
                    createdById: request.user.id,
                  },
                })
                created++
              }
            } else {
              // 處理解析出的 Q&A 條目
              for (const qa of qaEntries) {
                const existing = await prisma.knowledgeEntry.findFirst({
                  where: { question: qa.question },
                })

                if (existing) {
                  await prisma.knowledgeEntry.update({
                    where: { id: existing.id },
                    data: {
                      answer: qa.answer,
                      category: qa.category || '飛書同步',
                      source: 'FEISHU_SYNC',
                      sourceRef: node.obj_token,
                      updatedAt: new Date(),
                    },
                  })
                  updated++
                } else {
                  await prisma.knowledgeEntry.create({
                    data: {
                      question: qa.question,
                      answer: qa.answer,
                      category: qa.category || '飛書同步',
                      keywords: qa.keywords || [],
                      source: 'FEISHU_SYNC',
                      sourceRef: node.obj_token,
                      isActive: true,
                      isSyncedToAI: false,
                      createdById: request.user.id,
                    },
                  })
                  created++
                }
              }
            }
          } catch (err) {
            errors.push(`處理文檔 ${node.title} 時出錯: ${err}`)
          }
        }

        await createLog({
          entityType: 'knowledge',
          action: 'feishu_sync',
          details: { spaceId: wikiSpaceId, created, updated, errorCount: errors.length },
          userId: request.user.id,
          ipAddress: request.ip,
        })

        return {
          success: true,
          data: { created, updated, errors },
        }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          error: { code: 'SYNC_ERROR', message: `同步過程中出錯: ${err}` },
        })
      }
    }
  )
}

/**
 * 從文檔內容中解析 Q&A 格式
 */
function parseQAFromDocument(content: string, defaultCategory?: string): Array<{
  question: string
  answer: string
  category?: string
  keywords?: string[]
}> {
  const entries: Array<{
    question: string
    answer: string
    category?: string
    keywords?: string[]
  }> = []

  // 嘗試匹配 Q:/A: 格式
  const qaPattern1 = /(?:Q|問)[：:]\s*(.+?)\n(?:A|答)[：:]\s*(.+?)(?=(?:\n(?:Q|問)[：:])|$)/gs
  let match

  while ((match = qaPattern1.exec(content)) !== null) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()
    if (question && answer) {
      entries.push({
        question,
        answer,
        category: defaultCategory,
      })
    }
  }

  // 如果沒有匹配到，嘗試 Markdown 標題格式
  if (entries.length === 0) {
    const mdPattern = /##\s*(.+?)\n([\s\S]+?)(?=(?:\n##\s)|$)/g
    while ((match = mdPattern.exec(content)) !== null) {
      const question = match[1]?.trim()
      const answer = match[2]?.trim()
      if (question && answer && answer.length > 10) {
        entries.push({
          question,
          answer,
          category: defaultCategory,
        })
      }
    }
  }

  return entries
}
