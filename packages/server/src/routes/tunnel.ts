import { FastifyInstance } from 'fastify'
import { tunnelService } from '../services/tunnel.service.js'
import { config } from '../config/index.js'

export async function tunnelRoutes(fastify: FastifyInstance) {
  // 獲取 tunnel 狀態
  fastify.get('/status', async () => {
    const status = tunnelService.getStatus()
    const webhookUrl = tunnelService.getWebhookUrl()

    return {
      success: true,
      data: {
        ...status,
        webhookUrl,
      },
    }
  })

  // 啟動 tunnel
  fastify.post('/start', async () => {
    const result = await tunnelService.start(config.port)

    if (result.success) {
      return {
        success: true,
        data: {
          success: true,
          url: result.url,
          webhookUrl: tunnelService.getWebhookUrl(),
        },
      }
    }

    return {
      success: true,
      data: {
        success: false,
        error: result.error,
      },
    }
  })

  // 停止 tunnel
  fastify.post('/stop', async () => {
    const result = await tunnelService.stop()
    return {
      success: true,
      data: result,
    }
  })

  // 重啟 tunnel（獲取新 URL）
  fastify.post('/restart', async () => {
    const result = await tunnelService.restart(config.port)

    if (result.success) {
      return {
        success: true,
        data: {
          success: true,
          url: result.url,
          webhookUrl: tunnelService.getWebhookUrl(),
        },
      }
    }

    return {
      success: true,
      data: {
        success: false,
        error: result.error,
      },
    }
  })

  // 檢查 webhook 是否有效
  fastify.get('/health', async () => {
    const result = await tunnelService.checkHealth()
    return {
      success: true,
      data: result,
    }
  })
}
