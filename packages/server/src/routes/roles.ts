import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'
import { PERMISSIONS } from '../types/index.js'

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()),
})

const updateRoleSchema = createRoleSchema.partial()

export const rolesRoutes: FastifyPluginAsync = async (app) => {
  // 取得所有可用權限
  app.get(
    '/permissions',
    { preHandler: [authenticate, requirePermission('role.view')] },
    async () => {
      return { success: true, data: PERMISSIONS }
    }
  )

  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('role.view')] },
    async () => {
      const roles = await prisma.role.findMany({
        include: { _count: { select: { users: true } } },
        orderBy: { createdAt: 'asc' },
      })

      return { success: true, data: roles }
    }
  )

  // 詳情
  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('role.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const role = await prisma.role.findUnique({
        where: { id: parseInt(id) },
        include: { users: { select: { id: true, username: true, displayName: true } } },
      })

      if (!role) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '角色不存在' },
        })
      }

      return { success: true, data: role }
    }
  )

  // 新增
  app.post(
    '/',
    { preHandler: [authenticate, requirePermission('role.create')] },
    async (request) => {
      const data = createRoleSchema.parse(request.body)

      const role = await prisma.role.create({ data })

      await createLog({
        entityType: 'role',
        entityId: role.id,
        action: 'create',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: role }
    }
  )

  // 更新
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('role.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const data = updateRoleSchema.parse(request.body)

      // 檢查是否為系統角色
      const existing = await prisma.role.findUnique({ where: { id: parseInt(id) } })
      if (existing?.isSystem) {
        return reply.status(400).send({
          success: false,
          error: { code: 'SYSTEM_ROLE', message: '不能修改系統內建角色' },
        })
      }

      const role = await prisma.role.update({
        where: { id: parseInt(id) },
        data,
      })

      await createLog({
        entityType: 'role',
        entityId: role.id,
        action: 'update',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: role }
    }
  )

  // 刪除
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('role.delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      // 檢查是否為系統角色
      const existing = await prisma.role.findUnique({
        where: { id: parseInt(id) },
        include: { _count: { select: { users: true } } },
      })

      if (existing?.isSystem) {
        return reply.status(400).send({
          success: false,
          error: { code: 'SYSTEM_ROLE', message: '不能刪除系統內建角色' },
        })
      }

      if (existing?._count.users && existing._count.users > 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'HAS_USERS', message: '此角色下還有用戶，不能刪除' },
        })
      }

      await prisma.role.delete({ where: { id: parseInt(id) } })

      await createLog({
        entityType: 'role',
        entityId: parseInt(id),
        action: 'delete',
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )
}
