import type { Model } from 'mongoose'
import { ApiError } from '../utils/http.js'
import { connectMongo, isMongoConfigured } from './database.js'

interface OwnerContext {
  userId: string
  orgId?: string
}

type AnyRecord = Record<string, unknown>

export interface ListOwnedOptions {
  cursor?: string
  limit?: number
}

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 200
const CURSOR_SEPARATOR = '|'
const MONGO_ID_PATTERN = /^[a-f\d]{24}$/i

async function requireMongo() {
  if (!isMongoConfigured()) {
    throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'MongoDB is not configured.')
  }
  await connectMongo()
}

function boundedLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return DEFAULT_LIST_LIMIT
  return Math.min(Math.max(Math.round(limit ?? DEFAULT_LIST_LIMIT), 1), MAX_LIST_LIMIT)
}

function parseCursor(cursor: string | undefined) {
  if (!cursor) return undefined
  const [datePart, idPart] = cursor.split(CURSOR_SEPARATOR)
  if (!datePart) {
    throw new ApiError(400, 'INVALID_CURSOR', 'List cursor must be a valid ISO date.')
  }
  const cursorDate = new Date(datePart)
  if (Number.isNaN(cursorDate.getTime())) {
    throw new ApiError(400, 'INVALID_CURSOR', 'List cursor must be a valid ISO date.')
  }
  if (idPart && !MONGO_ID_PATTERN.test(idPart)) {
    throw new ApiError(400, 'INVALID_CURSOR', 'List cursor id must be a valid Mongo id.')
  }
  return { updatedAt: cursorDate, id: idPart }
}

function cursorQuery(cursor: string | undefined) {
  const parsed = parseCursor(cursor)
  if (!parsed) return {}
  if (!parsed.id) return { updatedAt: { $lt: parsed.updatedAt } }
  return {
    $or: [
      { updatedAt: { $lt: parsed.updatedAt } },
      { updatedAt: parsed.updatedAt, _id: { $lt: parsed.id } },
    ],
  }
}

function nextCursor(record: { _id?: unknown; updatedAt?: Date | string } | undefined) {
  if (!record?.updatedAt || !record._id) return null
  return `${new Date(record.updatedAt).toISOString()}${CURSOR_SEPARATOR}${String(record._id)}`
}

function ownerQuery(owner: OwnerContext, extra: AnyRecord = {}) {
  return {
    ...extra,
    ownerId: owner.userId,
    deletedAt: null,
  }
}

export async function listOwned(
  model: Model<unknown>,
  owner: OwnerContext,
  filter: AnyRecord = {},
  options: ListOwnedOptions = {},
) {
  const limit = boundedLimit(options.limit)
  const cursorFilter = cursorQuery(options.cursor)
  await requireMongo()
  const query = ownerQuery(owner, {
    ...filter,
    ...cursorFilter,
  })
  const records = await model.find(query).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).lean()
  const items = records.slice(0, limit)
  const last = items.at(-1) as { updatedAt?: Date | string } | undefined

  return {
    items,
    page: {
      limit,
      hasMore: records.length > limit,
      nextCursor: records.length > limit ? nextCursor(last) : null,
    },
  }
}

export async function createOwned(model: Model<unknown>, owner: OwnerContext, input: AnyRecord) {
  await requireMongo()
  return model.create({
    ...input,
    ownerId: owner.userId,
    orgId: owner.orgId ?? null,
  })
}

export async function updateOwned(model: Model<unknown>, owner: OwnerContext, id: string, input: AnyRecord) {
  await requireMongo()
  const updated = await model.findOneAndUpdate(ownerQuery(owner, { _id: id }), { $set: input }, { new: true }).lean()
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Record was not found.')
  return updated
}

export async function softDeleteOwned(model: Model<unknown>, owner: OwnerContext, id: string) {
  await requireMongo()
  const deleted = await model
    .findOneAndUpdate(ownerQuery(owner, { _id: id }), { $set: { deletedAt: new Date() } }, { new: true })
    .lean()
  if (!deleted) throw new ApiError(404, 'NOT_FOUND', 'Record was not found.')
  return deleted
}

export async function getOwned(model: Model<unknown>, owner: OwnerContext, id: string) {
  await requireMongo()
  const record = await model.findOne(ownerQuery(owner, { _id: id })).lean()
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'Record was not found.')
  return record
}
