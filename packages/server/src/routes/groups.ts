import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'

const updateGroupSchema = z.object({
  displayName: z.string().optional(),
  customerId: z.number().nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
})

export const groupsRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('group.view')] },
    async (request) => {
      const { page = 1, pageSize = 20, status, customerId } = request.query as {
        page?: number
        pageSize?: number
        status?: string
        customerId?: number
      }

      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (customerId) where.customerId = customerId

      const [groups, total] = await Promise.all([
        prisma.lineGroup.findMany({
          where,
          include: {
            customer: true,
            _count: { select: { messages: true, members: true, issues: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.lineGroup.count({ where }),
      ])

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
      const { page = 1, pageSize = 50 } = request.query as {
        page?: number
        pageSize?: number
      }

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

  // 群聊問答記錄
  app.get(
    '/:id/issues',
    { preHandler: [authenticate, requirePermission('group.view')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const { page = 1, pageSize = 20, status } = request.query as {
        page?: number
        pageSize?: number
        status?: string
      }

      const where: Record<string, unknown> = { groupId: parseInt(id) }
      if (status) where.status = status

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
}
