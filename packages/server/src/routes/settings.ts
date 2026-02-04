import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { getSettings, updateSettings } from '../services/settings.service.js'
import { createLog } from '../services/log.service.js'
import { resetClient } from '../services/line.service.js'

const updateSettingsSchema = z.record(z.string())

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // 取得所有設定
  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('setting.view')] },
    async () => {
      const settings = await getSettings()

      // 隱藏敏感資訊
      const masked = { ...settings }
      const sensitiveKeys = ['ai.claude.apiKey', 'ai.gemini.apiKey', 'line.channelSecret', 'line.channelAccessToken']
      for (const key of sensitiveKeys) {
        if (masked[key]) {
          masked[key] = masked[key].slice(0, 8) + '********'
        }
      }

      return { success: true, data: masked }
    }
  )

  // 批次更新設定
  app.put(
    '/',
    { preHandler: [authenticate, requirePermission('setting.edit')] },
    async (request) => {
      const updates = updateSettingsSchema.parse(request.body)

      await updateSettings(updates)

      // 如果更新了 LINE 設定，重置客戶端
      if (updates['line.channelAccessToken'] || updates['line.channelSecret']) {
        resetClient()
      }

      await createLog({
        entityType: 'setting',
        action: 'update',
        details: Object.keys(updates).reduce(
          (acc, key) => {
            acc[key] = key.includes('apiKey') || key.includes('Secret') || key.includes('Token')
              ? '***'
              : updates[key]
            return acc
          },
          {} as Record<string, string>
        ),
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: null }
    }
  )
}
