import { prisma } from '../lib/prisma.js'

interface LogParams {
  entityType: string
  entityId?: number
  action: string
  details?: Record<string, unknown>
  userId?: number
  ipAddress?: string
  userAgent?: string
}

export async function createLog(params: LogParams) {
  return prisma.activityLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      details: params.details,
      userId: params.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  })
}
