import { Router } from 'express'
import {
  deleteAiVaultDocumentController,
  ingestAiVaultTextController,
  listAiVaultCloudinaryAssetsController,
  listAiVaultDocumentsController,
  registerAiVaultDocumentController,
} from '../controllers/aiVaultController.js'
import { assistantMessageController } from '../controllers/assistantController.js'
import { createOwnedDataController } from '../controllers/dataController.js'
import { healthController } from '../controllers/healthController.js'
import { dailyQuizController } from '../controllers/quizController.js'
import { getSettingsController, updateSettingsController } from '../controllers/settingsController.js'
import { systemHealthController } from '../controllers/systemHealthController.js'
import { uploadSignatureController } from '../controllers/uploadController.js'
import { getMeController, updateMeController } from '../controllers/userController.js'
import { requireAstraAuth } from '../middleware/auth.js'
import { idempotency } from '../middleware/idempotency.js'
import { requireOpsAccess } from '../middleware/opsAuth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { validateBody, validateParams } from '../middleware/validate.js'
import { BookmarkModel } from '../models/bookmark.js'
import { DeadlineModel } from '../models/deadline.js'
import { EntertainmentDataModel } from '../models/entertainmentData.js'
import { HealthLogModel } from '../models/healthLog.js'
import { TaskModel } from '../models/task.js'
import { aiVaultDocumentSchema, aiVaultIngestTextSchema } from '../validators/aiVault.js'
import { assistantMessageSchema } from '../validators/assistant.js'
import {
  bookmarkSchema,
  bookmarkUpdateSchema,
  deadlineSchema,
  deadlineUpdateSchema,
  entertainmentDataSchema,
  entertainmentDataUpdateSchema,
  healthLogSchema,
  healthLogUpdateSchema,
  mongoIdParamSchema,
  settingsSchema,
  taskSchema,
  taskUpdateSchema,
} from '../validators/data.js'
import { uploadSignatureSchema } from '../validators/upload.js'
import { updateUserProfileSchema } from '../validators/user.js'
import { ApiError } from '../utils/http.js'
import { readinessController } from '../controllers/readinessController.js'

const tasksController = createOwnedDataController({ resource: 'tasks', model: TaskModel })
const bookmarksController = createOwnedDataController({ resource: 'bookmarks', model: BookmarkModel })
const deadlinesController = createOwnedDataController({ resource: 'deadlines', model: DeadlineModel })
const healthLogsController = createOwnedDataController({ resource: 'health-logs', model: HealthLogModel })
const entertainmentController = createOwnedDataController({
  resource: 'entertainment-data',
  model: EntertainmentDataModel,
})

function registerCrudRoutes(
  router: Router,
  path: string,
  createSchema: Parameters<typeof validateBody>[0],
  updateSchema: Parameters<typeof validateBody>[0],
  controller: ReturnType<typeof createOwnedDataController>,
) {
  router.get(path, requireAstraAuth, controller.list)
  router.post(path, requireAstraAuth, validateBody(createSchema), idempotency({ namespace: path.slice(1) }), controller.create)
  router.patch(`${path}/:id`, requireAstraAuth, validateParams(mongoIdParamSchema), validateBody(updateSchema), controller.update)
  router.delete(`${path}/:id`, requireAstraAuth, validateParams(mongoIdParamSchema), controller.remove)
}

export function createApiRouter() {
  const router = Router()

  router.get('/health', healthController)
  router.get('/ready', readinessController)
  router.get('/system/health', requireOpsAccess, systemHealthController)
  router.get('/quiz/daily', rateLimit({ namespace: 'quiz-daily', limit: 120, windowSeconds: 3600 }), dailyQuizController)

  router.get('/users/me', requireAstraAuth, getMeController)
  router.patch('/users/me', requireAstraAuth, validateBody(updateUserProfileSchema), updateMeController)

  registerCrudRoutes(router, '/tasks', taskSchema, taskUpdateSchema, tasksController)
  registerCrudRoutes(router, '/bookmarks', bookmarkSchema, bookmarkUpdateSchema, bookmarksController)
  registerCrudRoutes(router, '/deadlines', deadlineSchema, deadlineUpdateSchema, deadlinesController)
  registerCrudRoutes(router, '/health-logs', healthLogSchema, healthLogUpdateSchema, healthLogsController)
  registerCrudRoutes(router, '/entertainment-data', entertainmentDataSchema, entertainmentDataUpdateSchema, entertainmentController)

  router.get('/settings', requireAstraAuth, getSettingsController)
  router.patch('/settings', requireAstraAuth, validateBody(settingsSchema), updateSettingsController)

  router.post(
    '/assistant/messages',
    requireAstraAuth,
    rateLimit({ namespace: 'ai', limit: 30, windowSeconds: 3600 }),
    validateBody(assistantMessageSchema),
    assistantMessageController,
  )

  router.post(
    '/uploads/signature',
    requireAstraAuth,
    rateLimit({ namespace: 'upload', limit: 60, windowSeconds: 3600 }),
    validateBody(uploadSignatureSchema),
    idempotency({ namespace: 'uploads-signature', ttlSeconds: 3600 }),
    uploadSignatureController,
  )

  router.get('/ai-vault/documents', requireAstraAuth, listAiVaultDocumentsController)
  router.post(
    '/ai-vault/documents',
    requireAstraAuth,
    rateLimit({ namespace: 'vault-documents', limit: 120, windowSeconds: 3600 }),
    validateBody(aiVaultDocumentSchema),
    idempotency({ namespace: 'ai-vault-documents' }),
    registerAiVaultDocumentController,
  )
  router.delete(
    '/ai-vault/documents/:id',
    requireAstraAuth,
    validateParams(mongoIdParamSchema),
    deleteAiVaultDocumentController,
  )
  router.post(
    '/ai-vault/documents/:id/chunks',
    requireAstraAuth,
    rateLimit({ namespace: 'vault-ingest', limit: 60, windowSeconds: 3600 }),
    validateParams(mongoIdParamSchema),
    validateBody(aiVaultIngestTextSchema),
    ingestAiVaultTextController,
  )
  router.get('/ai-vault/storage/assets', requireAstraAuth, listAiVaultCloudinaryAssetsController)

  router.use((_req, _res, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'API route was not found.'))
  })

  return router
}
