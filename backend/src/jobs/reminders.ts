import { DeadlineModel } from '../models/deadline.js'
import { connectMongo, isMongoConfigured } from '../services/database.js'
import { logger } from '../utils/logger.js'

export interface ReminderCandidate {
  _id: unknown
  ownerId: string
  title: string
  dueDate: Date | string
  dueTime: string
  reminderEmail: string
  remindAt: Date | string
  remindBefore: string
}

export interface ReminderDeliveryProvider {
  configured: () => boolean
  send: (reminder: ReminderCandidate) => Promise<{ messageId?: string }>
}

export interface ReminderDispatchJobOptions {
  deliveryProvider?: ReminderDeliveryProvider
  limit?: number
  model?: ReminderModel
  now?: Date
}

export interface ReminderModel {
  find: (query: Record<string, unknown>) => {
    sort: (sort: Record<string, 1 | -1>) => {
      limit: (limit: number) => {
        lean: () => Promise<ReminderCandidate[]>
      }
    }
  }
  updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<unknown>
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 250

const disabledDeliveryProvider: ReminderDeliveryProvider = {
  configured: () => false,
  send: async () => {
    throw new Error('Reminder delivery provider is not configured.')
  },
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.round(value ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
}

function dueReminderQuery(now: Date) {
  return {
    deletedAt: null,
    reminderStatus: 'scheduled',
    reminderEmail: { $ne: '' },
    remindAt: { $ne: null, $lte: now },
  }
}

function reminderErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : 'Reminder delivery failed.'
}

export async function listDueReminderCandidates(options: ReminderDispatchJobOptions = {}) {
  const model = options.model ?? (DeadlineModel as unknown as ReminderModel)
  const now = options.now ?? new Date()
  const limit = boundedLimit(options.limit)
  return model
    .find(dueReminderQuery(now))
    .sort({ remindAt: 1, _id: 1 })
    .limit(limit)
    .lean()
}

export async function runReminderDispatchJob(options: ReminderDispatchJobOptions = {}) {
  const provider = options.deliveryProvider ?? disabledDeliveryProvider
  const model = options.model ?? (DeadlineModel as unknown as ReminderModel)
  const now = options.now ?? new Date()

  if (!isMongoConfigured()) {
    logger.info('Reminder dispatch skipped: MongoDB is not configured')
    return {
      due: 0,
      failed: 0,
      processed: 0,
      reason: 'mongo-not-configured',
      sent: 0,
      skipped: true,
    }
  }

  await connectMongo()
  const due = await listDueReminderCandidates({ ...options, model, now })

  if (due.length === 0) {
    return {
      due: 0,
      failed: 0,
      processed: 0,
      reason: 'no-due-reminders',
      sent: 0,
      skipped: false,
    }
  }

  if (!provider.configured()) {
    logger.info('Reminder dispatch skipped: no live delivery provider is configured', { due: due.length })
    return {
      due: due.length,
      failed: 0,
      processed: 0,
      reason: 'delivery-not-configured',
      sent: 0,
      skipped: true,
    }
  }

  let sent = 0
  let failed = 0

  for (const reminder of due) {
    try {
      await provider.send(reminder)
      await model.updateOne(
        { _id: reminder._id, ownerId: reminder.ownerId, reminderStatus: 'scheduled' },
        {
          $set: {
            reminderFailureReason: '',
            reminderLastAttemptAt: now,
            reminderSentAt: now,
            reminderStatus: 'sent',
          },
        },
      )
      sent += 1
    } catch (error) {
      failed += 1
      await model.updateOne(
        { _id: reminder._id, ownerId: reminder.ownerId, reminderStatus: 'scheduled' },
        {
          $set: {
            reminderFailureReason: reminderErrorMessage(error),
            reminderLastAttemptAt: now,
            reminderStatus: 'failed',
          },
        },
      )
    }
  }

  return {
    due: due.length,
    failed,
    processed: due.length,
    reason: failed > 0 ? 'completed-with-failures' : 'completed',
    sent,
    skipped: false,
  }
}
