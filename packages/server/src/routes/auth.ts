import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { validateUser } from '../services/auth.service.js'
import { createLog } from '../services/log.service.js'
import { authenticate } from '../middlewares/auth.js'
import { prisma } from '../lib/prisma.js'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const authRoutes: FastifyPluginAsync = async (app) => {
  // 登入
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const user = await validateUser(body.username, body.password)

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '帳號或密碼錯誤',
        },
      })
    }

    const token = app.jwt.sign({
      id: user.id,
      username: user.username,
      roleId: user.role.id,
      permissions: user.role.permissions,
    })

    await createLog({
      entityType: 'user',
      entityId: user.id,
      action: 'login',
      userId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })

    return {
      success: true,
      data: {
        accessToken: token,
        user,
      },
    }
  })

  // 取得當前用戶資訊
  app.get('/me', { preHandler: [authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { role: true },
    })

    if (!user) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用戶不存在',
        },
      }
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: {
          id: user.role.id,
          name: user.role.name,
          permissions: user.role.permissions,
        },
      },
    }
  })

  // 登出（記錄）
  app.post('/logout', { preHandler: [authenticate] }, async (request) => {
    await createLog({
      entityType: 'user',
      entityId: request.user.id,
      action: 'logout',
      userId: request.user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })

    return { success: true, data: null }
  })
}
