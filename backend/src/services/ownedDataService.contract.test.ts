import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOwned,
  getOwned,
  listOwned,
  softDeleteOwned,
  updateOwned,
} from './ownedDataService.js'

vi.mock('./database.js', () => ({
  connectMongo: vi.fn(async () => undefined),
  isMongoConfigured: vi.fn(() => true),
}))

function leanChain(value: unknown) {
  return { lean: vi.fn(async () => value) }
}

function findChain(value: unknown[]) {
  return {
    sort: vi.fn(() => ({
      limit: vi.fn(() => leanChain(value)),
    })),
  }
}

describe('owned data service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('injects trusted ownership on create and ignores caller-supplied owner fields', async () => {
    const model = {
      create: vi.fn(async (payload) => ({ _id: 'created', ...payload })),
    }

    await createOwned(model as never, { userId: 'user_a', orgId: 'org_a' }, {
      ownerId: 'attacker',
      orgId: 'attacker_org',
      title: 'Owned task',
    })

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org_a',
      ownerId: 'user_a',
      title: 'Owned task',
    }))
  })

  it('lists records with owner and non-deleted filters plus bounded pagination', async () => {
    const model = {
      find: vi.fn(() => findChain([
        { _id: '507f1f77bcf86cd799439011', updatedAt: new Date('2026-06-08T10:00:00.000Z') },
        { _id: '507f1f77bcf86cd799439012', updatedAt: new Date('2026-06-08T09:00:00.000Z') },
      ])),
    }

    const result = await listOwned(model as never, { userId: 'user_a' }, { status: 'todo' }, { limit: 1 })

    expect(model.find).toHaveBeenCalledWith({
      deletedAt: null,
      ownerId: 'user_a',
      status: 'todo',
    })
    expect(result.items).toHaveLength(1)
    expect(result.page).toMatchObject({
      hasMore: true,
      limit: 1,
      nextCursor: '2026-06-08T10:00:00.000Z|507f1f77bcf86cd799439011',
    })
  })

  it('uses composite cursor filters so equal timestamps do not skip records', async () => {
    const model = {
      find: vi.fn(() => findChain([])),
    }

    await listOwned(
      model as never,
      { userId: 'user_a' },
      {},
      { cursor: '2026-06-08T10:00:00.000Z|507f1f77bcf86cd799439011' },
    )

    expect(model.find).toHaveBeenCalledWith({
      deletedAt: null,
      ownerId: 'user_a',
      $or: [
        { updatedAt: { $lt: new Date('2026-06-08T10:00:00.000Z') } },
        {
          updatedAt: new Date('2026-06-08T10:00:00.000Z'),
          _id: { $lt: '507f1f77bcf86cd799439011' },
        },
      ],
    })
  })

  it('scopes update, delete, and get operations to the authenticated owner', async () => {
    const model = {
      findOne: vi.fn(() => leanChain({ _id: 'record' })),
      findOneAndUpdate: vi.fn(() => leanChain({ _id: 'record' })),
    }

    await updateOwned(model as never, { userId: 'user_a' }, '507f1f77bcf86cd799439011', { title: 'Updated' })
    await softDeleteOwned(model as never, { userId: 'user_a' }, '507f1f77bcf86cd799439012')
    await getOwned(model as never, { userId: 'user_a' }, '507f1f77bcf86cd799439013')

    expect(model.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { _id: '507f1f77bcf86cd799439011', deletedAt: null, ownerId: 'user_a' },
      { $set: { title: 'Updated' } },
      { new: true },
    )
    expect(model.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { _id: '507f1f77bcf86cd799439012', deletedAt: null, ownerId: 'user_a' },
      { $set: { deletedAt: expect.any(Date) } },
      { new: true },
    )
    expect(model.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439013',
      deletedAt: null,
      ownerId: 'user_a',
    })
  })
})
