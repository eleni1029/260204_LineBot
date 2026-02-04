import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'

const updateMemberSchema = z.object({
  role: z.enum(['STAFF', 'EXTERNAL_ADMIN', 'EXTERNAL']).optional(),
  notes: z.string().optional(),
})

export const membersRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('member.view')] },
    async (request) => {
      const { page = 1, pageSize = 20, role, search } = request.query as {
        page?: number
        pageSize?: number
        role?: string
        search?: string
      }

      const where: Record<string, unknown> = {}
      if (role) where.role = role
      if (search) {
        where.OR = [
          { displayName: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
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

  // 發言歷史
  app.get(
    '/:id/messages',
    { preHandler: [authenticate, requirePermission('member.view')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const { page = 1, pageSize = 50 } = request.query as {
        page?: number
        pageSize?: number
      }

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
}
