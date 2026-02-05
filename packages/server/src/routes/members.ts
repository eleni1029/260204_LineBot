import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'
import { getUserProfile } from '../services/line.service.js'

const updateMemberSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  role: z.enum(['STAFF', 'EXTERNAL_ADMIN', 'EXTERNAL']).optional(),
  notes: z.string().optional(),
})

export const membersRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('member.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        role?: string
        search?: string
      }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)

      const where: Record<string, unknown> = {}
      if (query.role) where.role = query.role
      if (query.search) {
        where.OR = [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { notes: { contains: query.search, mode: 'insensitive' } },
          { lineUserId: { contains: query.search, mode: 'insensitive' } },
        ]
      }

      const [members, total] = await Promise.all([
        prisma.member.findMany({
          where,
          include: {
            groups: {
              include: { group: true },
            },
            _count: { select: { messages: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.member.count({ where }),
      ])

      return {
        success: true,
        data: members,
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
    { preHandler: [authenticate, requirePermission('member.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const member = await prisma.member.findUnique({
        where: { id: parseInt(id) },
        include: {
          groups: {
            include: { group: { include: { customer: true } } },
          },
        },
      })

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '人員不存在' },
        })
      }

      return { success: true, data: member }
    }
  )

  // 更新（標記角色）
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('member.edit')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const data = updateMemberSchema.parse(request.body)

      const member = await prisma.member.update({
        where: { id: parseInt(id) },
        data,
      })

      await createLog({
        entityType: 'member',
        entityId: member.id,
        action: 'update',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: member }
    }
  )

  // 刪除
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('member.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const memberId = parseInt(id, 10)

      // 檢查成員是否存在
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        include: { _count: { select: { messages: true } } },
      })

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '人員不存在' },
        })
      }

      // 刪除相關的群組成員關聯
      await prisma.groupMember.deleteMany({
        where: { memberId },
      })

      // 刪除成員（訊息會因為外鍵關係保留，但 memberId 會變成 null）
      await prisma.member.delete({
        where: { id: memberId },
      })

      await createLog({
        entityType: 'member',
        entityId: memberId,
        action: 'delete',
        details: { displayName: member.displayName, lineUserId: member.lineUserId },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )

  // 批量刪除
  app.post(
    '/batch-delete',
    { preHandler: [authenticate, requirePermission('member.edit')] },
    async (request) => {
      const { ids } = request.body as { ids: number[] }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { success: false, error: { code: 'INVALID_INPUT', message: '請選擇要刪除的人員' } }
      }

      // 獲取要刪除的成員資訊（用於日誌）
      const members = await prisma.member.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, lineUserId: true },
      })

      // 刪除群組成員關聯
      await prisma.groupMember.deleteMany({
        where: { memberId: { in: ids } },
      })

      // 刪除成員
      const result = await prisma.member.deleteMany({
        where: { id: { in: ids } },
      })

      // 記錄日誌
      await createLog({
        entityType: 'member',
        entityId: undefined,
        action: 'batch_delete',
        details: { count: result.count, members: members.map(m => ({ id: m.id, displayName: m.displayName })) },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { deleted: result.count } }
    }
  )

  // 發言歷史
  app.get(
    '/:id/messages',
    { preHandler: [authenticate, requirePermission('member.view')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const query = request.query as { page?: string; pageSize?: string }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '50', 10)

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: { memberId: parseInt(id) },
          include: { group: true },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.count({ where: { memberId: parseInt(id) } }),
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

  // 從 LINE 同步個人資料
  app.post(
    '/:id/fetch-profile',
    { preHandler: [authenticate, requirePermission('member.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const member = await prisma.member.findUnique({
        where: { id: parseInt(id) },
      })

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '人員不存在' },
        })
      }

      try {
        const profile = await getUserProfile(member.lineUserId)
        if (profile) {
          const updatedMember = await prisma.member.update({
            where: { id: parseInt(id) },
            data: {
              displayName: profile.displayName,
              pictureUrl: profile.pictureUrl,
            },
            include: {
              groups: { include: { group: true } },
              _count: { select: { messages: true } },
            },
          })

          await createLog({
            entityType: 'member',
            entityId: member.id,
            action: 'fetch_profile',
            details: {
              oldName: member.displayName,
              newName: profile.displayName,
              pictureUrl: profile.pictureUrl,
            },
            userId: request.user.id,
            ipAddress: request.ip,
          })

          return { success: true, data: updatedMember }
        } else {
          return reply.status(400).send({
            success: false,
            error: { code: 'FETCH_FAILED', message: '無法從 LINE 取得個人資料，可能用戶已封鎖 Bot 或不在任何共同群組中' },
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

  // 批量同步個人資料
  app.post(
    '/batch-fetch-profile',
    { preHandler: [authenticate, requirePermission('member.edit')] },
    async (request) => {
      const { ids } = request.body as { ids: number[] }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { success: false, error: { code: 'INVALID_INPUT', message: '請選擇要同步的人員' } }
      }

      const members = await prisma.member.findMany({
        where: { id: { in: ids } },
      })

      let successCount = 0
      let failCount = 0
      const results: { id: number; name: string; success: boolean }[] = []

      for (const member of members) {
        try {
          const profile = await getUserProfile(member.lineUserId)
          if (profile) {
            await prisma.member.update({
              where: { id: member.id },
              data: {
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl,
              },
            })
            successCount++
            results.push({ id: member.id, name: profile.displayName, success: true })
          } else {
            failCount++
            results.push({ id: member.id, name: member.displayName || member.lineUserId, success: false })
          }
        } catch {
          failCount++
          results.push({ id: member.id, name: member.displayName || member.lineUserId, success: false })
        }
      }

      await createLog({
        entityType: 'member',
        entityId: undefined,
        action: 'batch_fetch_profile',
        details: { total: ids.length, success: successCount, failed: failCount },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return {
        success: true,
        data: { total: ids.length, success: successCount, failed: failCount, results },
      }
    }
  )
}
