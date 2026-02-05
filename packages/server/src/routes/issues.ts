import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'

const updateIssueSchema = z.object({
  status: z
    .enum(['PENDING', 'REPLIED', 'WAITING_CUSTOMER', 'TIMEOUT', 'RESOLVED', 'IGNORED'])
    .optional(),
})

export const issuesRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('issue.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        status?: string
        customerId?: string
        groupId?: string
      }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)

      const where: Record<string, unknown> = {}
      if (query.status) where.status = query.status
      if (query.customerId) where.customerId = parseInt(query.customerId, 10)
      if (query.groupId) where.groupId = parseInt(query.groupId, 10)

      const [issues, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          include: {
            group: { include: { customer: true } },
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

  // 詳情
  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('issue.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const issue = await prisma.issue.findUnique({
        where: { id: parseInt(id) },
        include: {
          group: { include: { customer: true } },
          customer: true,
          triggerMessage: { include: { member: true } },
          replyMessage: { include: { member: true } },
          repliedBy: true,
          tags: { include: { tag: true } },
        },
      })

      if (!issue) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '問題不存在' },
        })
      }

      return { success: true, data: issue }
    }
  )

  // 更新狀態
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('issue.edit')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const data = updateIssueSchema.parse(request.body)

      const updateData: Record<string, unknown> = { ...data }
      if (data.status === 'RESOLVED') {
        updateData.resolvedAt = new Date()
      }

      const issue = await prisma.issue.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          group: true,
          tags: { include: { tag: true } },
        },
      })

      await createLog({
        entityType: 'issue',
        entityId: issue.id,
        action: 'update',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: issue }
    }
  )

  // 刪除
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('issue.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const issueId = parseInt(id, 10)

      const issue = await prisma.issue.findUnique({
        where: { id: issueId },
        select: { id: true, questionSummary: true, status: true },
      })

      if (!issue) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '問題不存在' },
        })
      }

      // 刪除標籤關聯
      await prisma.issueTagRelation.deleteMany({
        where: { issueId },
      })

      // 刪除問題
      await prisma.issue.delete({
        where: { id: issueId },
      })

      await createLog({
        entityType: 'issue',
        entityId: issueId,
        action: 'delete',
        details: { questionSummary: issue.questionSummary, status: issue.status },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )

  // 批量刪除
  app.post(
    '/batch-delete',
    { preHandler: [authenticate, requirePermission('issue.edit')] },
    async (request) => {
      const { ids } = request.body as { ids: number[] }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { success: false, error: { code: 'INVALID_INPUT', message: '請選擇要刪除的問題' } }
      }

      // 獲取要刪除的問題資訊（用於日誌）
      const issues = await prisma.issue.findMany({
        where: { id: { in: ids } },
        select: { id: true, questionSummary: true, status: true },
      })

      // 刪除標籤關聯
      await prisma.issueTagRelation.deleteMany({
        where: { issueId: { in: ids } },
      })

      // 刪除問題
      const result = await prisma.issue.deleteMany({
        where: { id: { in: ids } },
      })

      await createLog({
        entityType: 'issue',
        entityId: undefined,
        action: 'batch_delete',
        details: { count: result.count, issues: issues.map(i => ({ id: i.id, summary: i.questionSummary })) },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { deleted: result.count } }
    }
  )

  // 批量更新狀態
  app.post(
    '/batch-update-status',
    { preHandler: [authenticate, requirePermission('issue.edit')] },
    async (request) => {
      const { ids, status } = request.body as { ids: number[]; status: string }

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { success: false, error: { code: 'INVALID_INPUT', message: '請選擇要更新的問題' } }
      }

      const validStatuses = ['PENDING', 'REPLIED', 'WAITING_CUSTOMER', 'TIMEOUT', 'RESOLVED', 'IGNORED']
      if (!validStatuses.includes(status)) {
        return { success: false, error: { code: 'INVALID_INPUT', message: '無效的狀態' } }
      }

      const updateData: Record<string, unknown> = { status }
      if (status === 'RESOLVED') {
        updateData.resolvedAt = new Date()
      }

      const result = await prisma.issue.updateMany({
        where: { id: { in: ids } },
        data: updateData,
      })

      await createLog({
        entityType: 'issue',
        entityId: undefined,
        action: 'batch_update_status',
        details: { count: result.count, status, ids },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: { updated: result.count } }
    }
  )

  // 統計資訊
  app.get(
    '/stats/summary',
    { preHandler: [authenticate, requirePermission('issue.view')] },
    async () => {
      // 問題統計
      const [pending, replied, timeout, resolved] = await Promise.all([
        prisma.issue.count({ where: { status: 'PENDING' } }),
        prisma.issue.count({ where: { status: 'REPLIED' } }),
        prisma.issue.count({ where: { status: 'TIMEOUT' } }),
        prisma.issue.count({ where: { status: 'RESOLVED' } }),
      ])

      // 群組/私聊統計
      const allGroups = await prisma.lineGroup.findMany({
        where: { status: 'ACTIVE' },
        select: { lineGroupId: true },
      })

      const privateChats = allGroups.filter((g) => g.lineGroupId.startsWith('user_')).length
      const groupChats = allGroups.length - privateChats

      // 訊息統計
      const [totalMessages, todayMessages] = await Promise.all([
        prisma.message.count(),
        prisma.message.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
      ])

      // 成員統計
      const totalMembers = await prisma.member.count()

      return {
        success: true,
        data: {
          pending,
          replied,
          timeout,
          resolved,
          privateChats,
          groupChats,
          totalMessages,
          todayMessages,
          totalMembers,
        },
      }
    }
  )
}
