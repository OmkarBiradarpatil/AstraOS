import { describe, expect, it } from 'vitest'
import type { Model } from 'mongoose'
import { AiVaultChunkModel } from './aiVaultChunk.js'
import { AiVaultDocumentModel } from './aiVaultDocument.js'
import { BookmarkModel } from './bookmark.js'
import { DeadlineModel } from './deadline.js'
import { EntertainmentDataModel } from './entertainmentData.js'
import { HealthLogModel } from './healthLog.js'
import { SettingsModel } from './settings.js'
import { TaskModel } from './task.js'
import { UserModel } from './user.js'

function hasIndex(model: Model<unknown>, expected: Record<string, unknown>) {
  return model.schema.indexes().some(([actual]) => JSON.stringify(actual) === JSON.stringify(expected))
}

describe('MongoDB index contracts', () => {
  it.each([
    ['tasks', TaskModel],
    ['bookmarks', BookmarkModel],
    ['deadlines', DeadlineModel],
    ['health logs', HealthLogModel],
    ['entertainment data', EntertainmentDataModel],
    ['AI Vault documents', AiVaultDocumentModel],
  ])('supports owner-scoped soft-delete pagination for %s', (_name, model) => {
    expect(hasIndex(model, { ownerId: 1, deletedAt: 1, updatedAt: -1, _id: -1 })).toBe(true)
  })

  it('keeps settings unique per owner', () => {
    expect(SettingsModel.schema.path('ownerId')?.options.unique).toBe(true)
  })

  it('keeps Clerk users unique by Clerk user id', () => {
    expect(UserModel.schema.path('clerkUserId')?.options.unique).toBe(true)
  })

  it('keeps AI Vault documents unique per owner and active content hash', () => {
    expect(hasIndex(AiVaultDocumentModel, { ownerId: 1, contentHash: 1 })).toBe(true)
  })

  it('keeps AI Vault chunks unique by owner, document, and chunk index', () => {
    expect(hasIndex(AiVaultChunkModel, { ownerId: 1, documentId: 1, index: 1 })).toBe(true)
  })

  it('marks email reminders as scheduled during deadline validation', async () => {
    const deadline = new DeadlineModel({
      ownerId: 'user_a',
      title: 'Submit project',
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
      dueTime: '18:00',
      reminderEmail: 'student@example.com',
      remindAt: new Date('2026-06-09T18:00:00.000Z'),
      remindBefore: '1d',
    })

    await deadline.validate()

    expect(deadline.reminderStatus).toBe('scheduled')
  })

  it('keeps deadlines without reminder targets in none state', async () => {
    const deadline = new DeadlineModel({
      ownerId: 'user_a',
      title: 'No reminder',
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
      dueTime: '18:00',
      reminderFailureReason: 'old failure',
      reminderLastAttemptAt: new Date('2026-06-09T18:00:00.000Z'),
      reminderSentAt: new Date('2026-06-09T18:00:00.000Z'),
      reminderStatus: 'failed',
    })

    await deadline.validate()

    expect(deadline.reminderStatus).toBe('none')
    expect(deadline.reminderFailureReason).toBe('')
    expect(deadline.reminderLastAttemptAt).toBeNull()
    expect(deadline.reminderSentAt).toBeNull()
  })
})
