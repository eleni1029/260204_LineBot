import { buildApp } from './app.js'
import { config } from './config/index.js'
import { logger } from './utils/logger.js'

const start = async () => {
  const app = await buildApp()

  try {
    await app.listen({ port: config.port, host: config.host })
    logger.info(`Server is running on http://${config.host}:${config.port}`)
  } catch (err) {
    logger.error(err)
    process.exit(1)
  }
}

start()
