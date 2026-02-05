import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { config } from './config/index.js'
import { logger } from './utils/logger.js'

// Routes
import { authRoutes } from './routes/auth.js'
import { webhookRoutes } from './routes/webhook.js'
import { customersRoutes } from './routes/customers.js'
import { groupsRoutes } from './routes/groups.js'
import { membersRoutes } from './routes/members.js'
import { messagesRoutes } from './routes/messages.js'
import { issuesRoutes } from './routes/issues.js'
import { usersRoutes } from './routes/users.js'
import { rolesRoutes } from './routes/roles.js'
import { settingsRoutes } from './routes/settings.js'
import { analysisRoutes } from './routes/analysis.js'
import { logsRoutes } from './routes/logs.js'
import { knowledgeRoutes } from './routes/knowledge.js'
import { tunnelRoutes } from './routes/tunnel.js'
import { feishuWebhookRoutes } from './routes/feishu-webhook.js'

export async function buildApp() {
  const app = Fastify({
    logger: logger,
  })

  // Plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  })

  await app.register(jwt, {
    secret: config.jwtSecret,
  })

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // API Routes
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(webhookRoutes, { prefix: '/api/webhook' })
  await app.register(feishuWebhookRoutes, { prefix: '/api/webhook' })
  await app.register(customersRoutes, { prefix: '/api/customers' })
  await app.register(groupsRoutes, { prefix: '/api/groups' })
  await app.register(membersRoutes, { prefix: '/api/members' })
  await app.register(messagesRoutes, { prefix: '/api/messages' })
  await app.register(issuesRoutes, { prefix: '/api/issues' })
  await app.register(usersRoutes, { prefix: '/api/users' })
  await app.register(rolesRoutes, { prefix: '/api/roles' })
  await app.register(settingsRoutes, { prefix: '/api/settings' })
  await app.register(analysisRoutes, { prefix: '/api/analysis' })
  await app.register(logsRoutes, { prefix: '/api/logs' })
  await app.register(knowledgeRoutes, { prefix: '/api/knowledge' })
  await app.register(tunnelRoutes, { prefix: '/api/tunnel' })

  return app
}
