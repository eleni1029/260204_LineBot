import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'

export const logsRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('log.view')] },
    async (request) => {
      const query = request.query as {
        page?: string
        pageSize?: string
        entityType?: string
        action?: string
        userId?: string
        startDate?: string
        endDate?: string
      }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '50', 10)

      const where: Record<string, unknown> = {}
      if (query.entityType) where.entityType = query.entityType
      if (query.action) where.action = query.action
      if (query.userId) where.userId = parseInt(query.userId, 10)
      if (query.startDate || query.endDate) {
        where.createdAt = {}
        if (query.startDate) (where.createdAt as Record<string, Date>).gte = new Date(query.startDate)
        if (query.endDate) (where.createdAt as Record<string, Date>).lte = new Date(query.endDate)
      }

      const [logs, total] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.activityLog.count({ where }),
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
}
