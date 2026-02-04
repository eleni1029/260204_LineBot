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
      const {
        page = 1,
        pageSize = 50,
        groupId,
        memberId,
        search,
        startDate,
        endDate,
      } = request.query as {
        page?: number
        pageSize?: number
        groupId?: number
        memberId?: number
        search?: string
        startDate?: string
        endDate?: string
      }

      const where: Record<string, unknown> = {}
      if (groupId) where.groupId = groupId
      if (memberId) where.memberId = memberId
      if (search) {
        where.content = { contains: search, mode: 'insensitive' }
      }
      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) (where.createdAt as Record<string, Date>).gte = new Date(startDate)
        if (endDate) (where.createdAt as Record<string, Date>).lte = new Date(endDate)
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
