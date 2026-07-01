import { createApp } from './api/app.js'
import { connectMongo } from './services/database.js'
import { env } from './utils/env.js'
import { logger } from './utils/logger.js'

const port = Number(env('PORT') ?? 3000)
const app = createApp()

await connectMongo()

app.listen(port, () => {
  logger.info('AstraOS API listening', { port })
})
