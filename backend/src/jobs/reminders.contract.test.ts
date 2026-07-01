import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDueReminderCandidates, runReminderDispatchJob, type ReminderCandidate, type ReminderModel } from './reminders.js'
import { connectMongo, isMongoConfigured } from '../services/database.js'

vi.mock('../services/database.js', () => ({
  connectMongo: vi.fn(async () => undefined),
  isMongoConfigured: vi.fn(() => true),
}))

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

function findChain(value: ReminderCandidate[] = []) {
  const lean = vi.fn(async () => value)
  const limit = vi.fn(() => ({ lean }))
  const sort = vi.fn(() => ({ limit }))
  return {
    chain: { sort },
    lean,
    limit,
    sort,
  }
}

function reminder(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    _id: '507f1f77bcf86cd799439011',
    dueDate: '2026-06-10',
    dueTime: '18:00',
    ownerId: 'user_a',
    remindAt: '2026-06-09T12:00:00.000Z',
    remindBefore: '1d',
    reminderEmail: 'student@example.com',
    title: 'Submit project',
    ...overrides,
  }
}

describe('reminder dispatch job contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isMongoConfigured).mockReturnValue(true)
  })

  it('skips honestly when MongoDB is not configured', async () => {
    vi.mocked(isMongoConfigured).mockReturnValue(false)
    const model = {
      find: vi.fn(),
      updateOne: vi.fn(),
    }

    await expect(runReminderDispatchJob({ model: model as unknown as ReminderModel })).resolves.toMatchObject({
      due: 0,
      processed: 0,
      reason: 'mongo-not-configured',
      skipped: true,
    })
    expect(connectMongo).not.toHaveBeenCalled()
    expect(model.find).not.toHaveBeenCalled()
  })

  it('queries only due scheduled reminders with a bounded limit', async () => {
    const now = new Date('2026-06-09T12:30:00.000Z')
    const chain = findChain([reminder()])
    const model = {
      find: vi.fn(() => chain.chain),
      updateOne: vi.fn(),
    }

    const due = await listDueReminderCandidates({ limit: 10_000, model: model as unknown as ReminderModel, now })

    expect(due).toHaveLength(1)
    expect(model.find).toHaveBeenCalledWith({
      deletedAt: null,
      reminderEmail: { $ne: '' },
      reminderStatus: 'scheduled',
      remindAt: { $ne: null, $lte: now },
    })
    expect(chain.sort).toHaveBeenCalledWith({ remindAt: 1, _id: 1 })
    expect(chain.limit).toHaveBeenCalledWith(250)
  })

  it('does not mutate due reminders when no delivery provider is configured', async () => {
    const chain = findChain([reminder()])
    const model = {
      find: vi.fn(() => chain.chain),
      updateOne: vi.fn(),
    }

    await expect(runReminderDispatchJob({ model: model as unknown as ReminderModel })).resolves.toMatchObject({
      due: 1,
      processed: 0,
      reason: 'delivery-not-configured',
      skipped: true,
    })
    expect(connectMongo).toHaveBeenCalled()
    expect(model.updateOne).not.toHaveBeenCalled()
  })

  it('marks delivered and failed reminders with owner-scoped updates', async () => {
    const now = new Date('2026-06-09T13:00:00.000Z')
    const successful = reminder()
    const failing = reminder({ _id: '507f1f77bcf86cd799439012', ownerId: 'user_b' })
    const chain = findChain([successful, failing])
    const model = {
      find: vi.fn(() => chain.chain),
      updateOne: vi.fn(async () => ({ acknowledged: true })),
    }
    const provider = {
      configured: vi.fn(() => true),
      send: vi.fn(async (item: ReminderCandidate) => {
        if (item._id === failing._id) throw new Error('SMTP down')
        return { messageId: 'message-1' }
      }),
    }

    await expect(runReminderDispatchJob({
      deliveryProvider: provider,
      model: model as unknown as ReminderModel,
      now,
    })).resolves.toMatchObject({
      due: 2,
      failed: 1,
      processed: 2,
      reason: 'completed-with-failures',
      sent: 1,
      skipped: false,
    })
    expect(model.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: successful._id, ownerId: successful.ownerId, reminderStatus: 'scheduled' },
      {
        $set: {
          reminderFailureReason: '',
          reminderLastAttemptAt: now,
          reminderSentAt: now,
          reminderStatus: 'sent',
        },
      },
    )
    expect(model.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: failing._id, ownerId: failing.ownerId, reminderStatus: 'scheduled' },
      {
        $set: {
          reminderFailureReason: 'SMTP down',
          reminderLastAttemptAt: now,
          reminderStatus: 'failed',
        },
      },
    )
  })
})
