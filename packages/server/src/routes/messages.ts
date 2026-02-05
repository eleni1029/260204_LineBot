import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'

export const messagesRoutes: FastifyPluginAsync = async (app) => {
  // 列表（全域搜尋）
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('message.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        groupId?: string
        memberId?: string
        search?: string
        startDate?: string
        endDate?: string
      }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '50', 10)

      const where: Record<string, unknown> = {}
      if (query.groupId) where.groupId = parseInt(query.groupId, 10)
      if (query.memberId) where.memberId = parseInt(query.memberId, 10)
      if (query.search) {
        where.content = { contains: query.search, mode: 'insensitive' }
      }
      if (query.startDate || query.endDate) {
        where.createdAt = {}
        if (query.startDate) (where.createdAt as Record<string, Date>).gte = new Date(query.startDate)
        if (query.endDate) (where.createdAt as Record<string, Date>).lte = new Date(query.endDate)
      }

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where,
          include: {
            group: { include: { customer: true } },
            member: true,
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.count({ where }),
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

  // 詳情
  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('message.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const message = await prisma.message.findUnique({
        where: { id: parseInt(id) },
        include: {
          group: { include: { customer: true } },
          member: true,
          triggeredIssue: true,
          replyToIssue: true,
        },
      })

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '訊息不存在' },
        })
      }

      return { success: true, data: message }
    }
  )
}
