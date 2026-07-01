import { AiVaultChunkModel } from '../models/aiVaultChunk.js'
import { AiVaultDocumentModel } from '../models/aiVaultDocument.js'
import { BookmarkModel } from '../models/bookmark.js'
import { DeadlineModel } from '../models/deadline.js'
import { EntertainmentDataModel } from '../models/entertainmentData.js'
import { HealthLogModel } from '../models/healthLog.js'
import { SettingsModel } from '../models/settings.js'
import { TaskModel } from '../models/task.js'
import { UserModel } from '../models/user.js'
import { connectMongo } from '../services/database.js'

const models = [
  UserModel,
  TaskModel,
  BookmarkModel,
  DeadlineModel,
  HealthLogModel,
  SettingsModel,
  AiVaultDocumentModel,
  AiVaultChunkModel,
  EntertainmentDataModel,
]

async function main() {
  const connection = await connectMongo()
  if (!connection) throw new Error('MONGODB_URI is required to sync indexes.')
  for (const model of models) {
    await model.syncIndexes()
    console.log(`Synced indexes for ${model.modelName}`)
  }
  await connection.disconnect()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
