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
      const {
        page = 1,
        pageSize = 50,
        entityType,
        action,
        userId,
        startDate,
        endDate,
      } = request.query as {
        page?: number
        pageSize?: number
        entityType?: string
        action?: string
        userId?: number
        startDate?: string
        endDate?: string
      }

      const where: Record<string, unknown> = {}
      if (entityType) where.entityType = entityType
      if (action) where.action = action
      if (userId) where.userId = userId
      if (startDate || endDate) {
        where.createdAt = {}
        if (startDate) (where.createdAt as Record<string, Date>).gte = new Date(startDate)
        if (endDate) (where.createdAt as Record<string, Date>).lte = new Date(endDate)
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
