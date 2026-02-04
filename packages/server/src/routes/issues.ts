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
      const { page = 1, pageSize = 20, status, customerId, groupId } = request.query as {
        page?: number
        pageSize?: number
        status?: string
        customerId?: number
        groupId?: number
      }

      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (customerId) where.customerId = customerId
      if (groupId) where.groupId = groupId

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

  // 統計資訊
  app.get(
    '/stats/summary',
    { preHandler: [authenticate, requirePermission('issue.view')] },
    async () => {
      const [pending, replied, timeout, resolved] = await Promise.all([
        prisma.issue.count({ where: { status: 'PENDING' } }),
        prisma.issue.count({ where: { status: 'REPLIED' } }),
        prisma.issue.count({ where: { status: 'TIMEOUT' } }),
        prisma.issue.count({ where: { status: 'RESOLVED' } }),
      ])

      return {
        success: true,
        data: { pending, replied, timeout, resolved },
      }
    }
  )
}
