import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/permission.js'
import { runAnalysis } from '../services/analysis.service.js'
import { createLog } from '../services/log.service.js'

const runAnalysisSchema = z.object({
  groupId: z.number().optional(),
  since: z.string().optional(),
})

export const analysisRoutes: FastifyPluginAsync = async (app) => {
  // 執行分析
  app.post(
    '/run',
    { preHandler: [authenticate, requirePermission('analysis.run')] },
    async (request) => {
      const params = runAnalysisSchema.parse(request.body)

      const results = await runAnalysis({
        groupId: params.groupId,
        since: params.since ? new Date(params.since) : undefined,
      })

      await createLog({
        entityType: 'analysis',
        action: 'analyze',
        details: { params, results },
        userId: request.user.id,
        ipAddress: request.ip,
      })

      return { success: true, data: results }
    }
  )
}
