import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { createLog } from '../services/log.service.js'

const createCustomerSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
})

const updateCustomerSchema = createCustomerSchema.partial()

const updateGroupsSchema = z.object({
  groupIds: z.array(z.number()),
})

export const customersRoutes: FastifyPluginAsync = async (app) => {
  // 列表
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('customer.view')] },
    async (request) => {
      const query = request.query as { page?: string; pageSize?: string; search?: string }
      const page = parseInt(query.page || '1', 10)
      const pageSize = parseInt(query.pageSize || '20', 10)

      const where = query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { contactPerson: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: {
            groups: true,
            _count: { select: { issues: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.customer.count({ where }),
      ])

      return {
        success: true,
        data: customers,
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
    { preHandler: [authenticate, requirePermission('customer.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(id) },
        include: {
          groups: {
            include: {
              _count: { select: { messages: true, members: true } },
            },
          },
          issues: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
      })

      if (!customer) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: '客戶不存在' },
        })
      }

      return { success: true, data: customer }
    }
  )

  // 新增
  app.post(
    '/',
    { preHandler: [authenticate, requirePermission('customer.create')] },
    async (request) => {
      const data = createCustomerSchema.parse(request.body)

      const customer = await prisma.customer.create({ data })

      await createLog({
        entityType: 'customer',
        entityId: customer.id,
        action: 'create',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: customer }
    }
  )

  // 更新
  app.put(
    '/:id',
    { preHandler: [authenticate, requirePermission('customer.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const data = updateCustomerSchema.parse(request.body)

      const customer = await prisma.customer.update({
        where: { id: parseInt(id) },
        data,
      })

      await createLog({
        entityType: 'customer',
        entityId: customer.id,
        action: 'update',
        details: data,
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: customer }
    }
  )

  // 刪除
  app.delete(
    '/:id',
    { preHandler: [authenticate, requirePermission('customer.delete')] },
    async (request) => {
      const { id } = request.params as { id: string }

      await prisma.customer.delete({ where: { id: parseInt(id) } })

      await createLog({
        entityType: 'customer',
        entityId: parseInt(id),
        action: 'delete',
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )

  // 更新綁定群聊
  app.put(
    '/:id/groups',
    { preHandler: [authenticate, requirePermission('customer.edit')] },
    async (request) => {
      const { id } = request.params as { id: string }
      const { groupIds } = updateGroupsSchema.parse(request.body)

      // 先解除所有綁定
      await prisma.lineGroup.updateMany({
        where: { customerId: parseInt(id) },
        data: { customerId: null },
      })

      // 重新綁定
      await prisma.lineGroup.updateMany({
        where: { id: { in: groupIds } },
        data: { customerId: parseInt(id) },
      })

      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(id) },
        include: { groups: true },
      })

      await createLog({
        entityType: 'customer',
        entityId: parseInt(id),
        action: 'update',
        details: { groupIds },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: customer }
    }
  )
}
