import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'
import { hashPassword } from '../services/auth.service.js'

const createUserSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
  roleId: z.number(),
})

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  displayName: z.string().optional(),
  roleId: z.number().optional(),
  isActive: z.boolean().optional(),
})

export const usersRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('user.view')] },
    async (request) => {
      const { page = 1, pageSize = 20 } = request.query as {
        page?: number
        pageSize?: number
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          include: { role: true },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count(),
      ])

      const sanitizedUsers = users.map(({ passwordHash, ...user }) => user)

      return {
        success: true,
        data: sanitizedUsers,
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
    { preHandler: [authenticate, requirePermission('user.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const user = await prisma.user.findUnique({
        where: { id: parseInt(id) },
        include: { role: true },
      })

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '用戶不存在' },
        })
      }

      const { passwordHash, ...sanitizedUser } = user
      return { success: true, data: sanitizedUser }
    }
  )

  // 新增
  app.post(
    '/',
    { preHandler: [authenticate, requirePermission('user.create')] },
    async (request, reply) => {
      const data = createUserSchema.parse(request.body)

      // 檢查用戶名和郵箱是否已存在
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ username: data.username }, { email: data.email }],
        },
      })

      if (existing) {
        return reply.status(400).send({
          success: false,
          error: { code: 'DUPLICATE', message: '用戶名或郵箱已存在' },
        })
      }

      const passwordHash = await hashPassword(data.password)

      const user = await prisma.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash,
          displayName: data.displayName,
          roleId: data.roleId,
        },
        include: { role: true },
      })

      await createLog({
        entityType: 'user',
        entityId: user.id,
        action: 'create',
        details: { username: data.username, email: data.email, roleId: data.roleId },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      const { passwordHash: _, ...sanitizedUser } = user
      return { success: true, data: sanitizedUser }
    }
  )

  // 更新
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('user.edit')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const data = updateUserSchema.parse(request.body)

      const updateData: Record<string, unknown> = { ...data }
      if (data.password) {
        updateData.passwordHash = await hashPassword(data.password)
        delete updateData.password
      }

      const user = await prisma.user.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: { role: true },
      })

      await createLog({
        entityType: 'user',
        entityId: user.id,
        action: 'update',
        details: { ...data, password: data.password ? '***' : undefined },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      const { passwordHash, ...sanitizedUser } = user
      return { success: true, data: sanitizedUser }
    }
  )

  // 刪除
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('user.delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      // 不能刪除自己
      if (parseInt(id) === request.user.id) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_OPERATION', message: '不能刪除自己的帳號' },
        })
      }

      await prisma.user.delete({ where: { id: parseInt(id) } })

      await createLog({
        entityType: 'user',
        entityId: parseInt(id),
        action: 'delete',
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )
}
