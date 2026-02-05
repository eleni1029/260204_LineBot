import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'
import { getGroupSummary } from '../services/line.service.js'

const updateGroupSchema = z.object({
  displayName: z.string().optional(),
  customerId: z.number().nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  knowledgeCategories: z.array(z.string()).optional(),
  autoReplyEnabled: z.boolean().optional(),
})

export const groupsRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('group.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        status?: string
        customerId?: string
        search?: string
      }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)

      const where: Record<string, unknown> = {}
      if (query.status) where.status = query.status
      if (query.customerId) where.customerId = parseInt(query.customerId, 10)
      if (query.search) {
        where.OR = [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { lineGroupId: { contains: query.search, mode: 'insensitive' } },
        ]
      }

      const [groups, total] = await Promise.all([
        prisma.lineGroup.findMany({
          where,
          select: {
            id: true,
            lineGroupId: true,
            channel: true,
            displayName: true,
            status: true,
            knowledgeCategories: true,
            autoReplyEnabled: true,
            customerId: true,
            updatedAt: true,
            customer: true,
            _count: { select: { messages: true, members: true, issues: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.lineGroup.count({ where }),
      ])

      // 對於私聊且沒有設定有效名稱的，嘗試從人員資料取得名稱
      // "私聊" 或 "私聊對話" 視為沒有設定名稱
      const privateChatsWithoutName = groups.filter(
        g => g.lineGroupId.startsWith('user_') &&
             (!g.displayName || g.displayName === '私聊' || g.displayName === '私聊對話')
      )

      if (privateChatsWithoutName.length > 0) {
        // 提取 lineUserIds
        const lineUserIds = privateChatsWithoutName.map(g => g.lineGroupId.replace('user_', ''))

        // 查詢對應的人員
        const members = await prisma.member.findMany({
          where: { lineUserId: { in: lineUserIds } },
          select: { lineUserId: true, displayName: true },
        })

        // 建立 lineUserId -> displayName 的對照表
        const memberNameMap = new Map(members.map(m => [m.lineUserId, m.displayName]))

        // 將人員名稱填入群組資料
        for (const group of groups) {
          if (group.lineGroupId.startsWith('user_') && !group.displayName) {
            const lineUserId = group.lineGroupId.replace('user_', '')
            const memberName = memberNameMap.get(lineUserId)
            if (memberName) {
              ;(group as { displayName: string | null }).displayName = memberName
            }
          }
        }
      }

      return {
        success: true,
        data: groups,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }
  )

  // 詳情
  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('group.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const group = await prisma.lineGroup.findUnique({
        where: { id: parseInt(id) },
        include: {
          customer: true,
          members: {
            include: { member: true },
          },
        },
      })

      if (!group) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '群聊不存在' },
        })
      }

      // 對於私聊且沒有設定有效名稱的，嘗試從人員資料取得名稱
      const needsAutoName = !group.displayName || group.displayName === '私聊' || group.displayName === '私聊對話'
      if (group.lineGroupId.startsWith('user_') && needsAutoName) {
        const lineUserId = group.lineGroupId.replace('user_', '')
        const member = await prisma.member.findUnique({
          where: { lineUserId },
          select: { displayName: true },
        })
        if (member?.displayName) {
          ;(group as { displayName: string | null }).displayName = member.displayName
        }
      }

      return { success: true, data: group }
    }
  )

  // 更新
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('group.edit')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const data = updateGroupSchema.parse(request.body)

      const group = await prisma.lineGroup.update({
        where: { id: parseInt(id) },
        data,
        include: { customer: true },
      })

      await createLog({
        entityType: 'group',
        entityId: group.id,
        action: 'update',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: group }
    }
  )

  // 群聊訊息歷史
  app.get(
    '/:id/messages',
    { preHandler: [authenticate, requirePermission('group.view')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const query = request.query as { page?: string; pageSize?: string }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '50', 10)

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: { groupId: parseInt(id) },
          include: { member: true },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.count({ where: { groupId: parseInt(id) } }),
      ])

      return {
        success: true,
        data: messages,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }
  )

  // 批量更新群組設定（知識庫分類、自動回覆、綁定客戶）
  app.post(
    '/batch-update-categories',
    { preHandler: [authenticate, requirePermission('group.edit')] },
    async (request) => {
      const { groupIds, knowledgeCategories, autoReplyEnabled, customerId } = request.body as {
        groupIds: number[]
        knowledgeCategories?: string[]
        autoReplyEnabled?: boolean
        customerId?: number | null
      }

      if (!groupIds || groupIds.length === 0) {
        return { success: false, error: { code: 'INVALID_IDS', message: '請選擇群組' } }
      }

      const updateData: Record<string, unknown> = {}
      if (knowledgeCategories !== undefined) {
        updateData.knowledgeCategories = knowledgeCategories
      }
      if (autoReplyEnabled !== undefined) {
        updateData.autoReplyEnabled = autoReplyEnabled
      }
      if (customerId !== undefined) {
        updateData.customerId = customerId
      }

      const result = await prisma.lineGroup.updateMany({
        where: { id: { in: groupIds } },
        data: updateData,
      })

      await createLog({
        entityType: 'group',
        action: 'batch_update',
        details: { groupIds, knowledgeCategories, autoReplyEnabled, customerId, updated: result.count },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { updated: result.count } }
    }
  )

  // 群聊問答記錄
  app.get(
    '/:id/issues',
    { preHandler: [authenticate, requirePermission('group.view')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const query = request.query as { page?: string; pageSize?: string; status?: string }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)

      const where: Record<string, unknown> = { groupId: parseInt(id) }
      if (query.status) where.status = query.status

      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          include: {
            triggerMessage: { include: { member: true } },
            replyMessage: { include: { member: true } },
            repliedBy: true,
            tags: { include: { tag: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.issue.count({ where }),
      ])

      return {
        success: true,
        data: issues,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }
  )

  // 從 LINE 取得群組名稱
  app.post(
    '/:id/fetch-name',
    { preHandler: [authenticate, requirePermission('group.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const group = await prisma.lineGroup.findUnique({
        where: { id: parseInt(id) },
      })

      if (!group) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '群組不存在' },
        })
      }

      // 私聊無法取得名稱
      if (group.lineGroupId.startsWith('user_')) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NOT_SUPPORTED', message: '私聊無法取得群組名稱' },
        })
      }

      try {
        const summary = await getGroupSummary(group.lineGroupId)
        if (summary && summary.groupName) {
          const updatedGroup = await prisma.lineGroup.update({
            where: { id: parseInt(id) },
            data: { displayName: summary.groupName },
            include: { customer: true },
          })

          await createLog({
            entityType: 'group',
            entityId: group.id,
            action: 'fetch_name',
            details: { oldName: group.displayName, newName: summary.groupName },
            userId: request.user.id,
            ipAddress: request.ip,
          })

          return { success: true, data: updatedGroup }
        } else {
          return reply.status(400).send({
            success: false,
            error: { code: 'FETCH_FAILED', message: '無法從 LINE 取得群組名稱，可能 Bot 已不在此群組中' },
          })
        }
      } catch (err) {
        return reply.status(500).send({
          success: false,
          error: { code: 'LINE_API_ERROR', message: `LINE API 錯誤: ${err}` },
        })
      }
    }
  )

  // 刪除群組
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('group.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const groupId = parseInt(id, 10)

      const group = await prisma.lineGroup.findUnique({
        where: { id: groupId },
        include: { _count: { select: { messages: true, issues: true, members: true } } },
      })

      if (!group) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '群組不存在' },
        })
      }

      // 刪除相關的群組成員關聯
      await prisma.groupMember.deleteMany({
        where: { groupId },
      })

      // 刪除相關的 Issue 標籤關聯和 Issues
      const issues = await prisma.issue.findMany({
        where: { groupId },
        select: { id: true },
      })
      if (issues.length > 0) {
        await prisma.issueTagRelation.deleteMany({
          where: { issueId: { in: issues.map(i => i.id) } },
        })
        await prisma.issue.deleteMany({
          where: { groupId },
        })
      }

      // 刪除訊息（保留成員，只解除關聯）
      await prisma.message.deleteMany({
        where: { groupId },
      })

      // 刪除群組
      await prisma.lineGroup.delete({
        where: { id: groupId },
      })

      await createLog({
        entityType: 'group',
        entityId: groupId,
        action: 'delete',
        details: {
          displayName: group.displayName,
          lineGroupId: group.lineGroupId,
          messagesCount: group._count.messages,
          issuesCount: group._count.issues,
        },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )

  // 批量刪除群組
  app.post(
    '/batch-delete',
    { preHandler: [authenticate, requirePermission('group.edit')] },
    async (request) => {
      const { ids } = request.body as { ids: number[] }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { success: false, error: { code: 'INVALID_INPUT', message: '請選擇要刪除的群組' } }
      }

      // 獲取要刪除的群組資訊
      const groups = await prisma.lineGroup.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, lineGroupId: true },
      })

      // 刪除群組成員關聯
      await prisma.groupMember.deleteMany({
        where: { groupId: { in: ids } },
      })

      // 刪除相關 Issues 的標籤關聯
      const issues = await prisma.issue.findMany({
        where: { groupId: { in: ids } },
        select: { id: true },
      })
      if (issues.length > 0) {
        await prisma.issueTagRelation.deleteMany({
          where: { issueId: { in: issues.map(i => i.id) } },
        })
        await prisma.issue.deleteMany({
          where: { groupId: { in: ids } },
        })
      }

      // 刪除訊息
      await prisma.message.deleteMany({
        where: { groupId: { in: ids } },
      })

      // 刪除群組
      const result = await prisma.lineGroup.deleteMany({
        where: { id: { in: ids } },
      })

      await createLog({
        entityType: 'group',
        entityId: undefined,
        action: 'batch_delete',
        details: { count: result.count, groups: groups.map(g => ({ id: g.id, displayName: g.displayName })) },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { deleted: result.count } }
    }
  )
}
