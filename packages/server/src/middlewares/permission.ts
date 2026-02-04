import { FastifyRequest, FastifyReply } from 'fastify'
import { PermissionCode } from '../types/index.js'

export function requirePermission(permission: PermissionCode) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user
    if (!user.permissions.includes(permission)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '權限不足',
        },
      })
    }
  }
}

export function requireAnyPermission(permissions: PermissionCode[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user
    const hasPermission = permissions.some((p) => user.permissions.includes(p))
    if (!hasPermission) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '權限不足',
        },
      })
    }
  }
}
