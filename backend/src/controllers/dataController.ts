import type { RequestHandler } from 'express'
import type { Model } from 'mongoose'
import { cached, cacheHash, deleteCached } from '../services/redisService.js'
import { createOwned, listOwned, softDeleteOwned, updateOwned } from '../services/ownedDataService.js'
import { ApiError, created, ok } from '../utils/http.js'

interface OwnedDataControllerOptions {
  resource: string
  model: Model<any>
}

function queryString(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined
}

function queryLimit(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'INVALID_LIMIT', 'List limit must be an integer from 1 to 200.')
  }
  const raw = Number(value)
  if (!Number.isInteger(raw) || raw < 1 || raw > 200) {
    throw new ApiError(400, 'INVALID_LIMIT', 'List limit must be an integer from 1 to 200.')
  }
  return raw
}

function listCacheKey(resource: string, userId: string, options: { cursor?: string; limit?: number } = {}) {
  return `query:${resource}:list:${userId}:${cacheHash(JSON.stringify(options))}`
}

function recordCacheKey(resource: string, userId: string, id: string) {
  return `query:${resource}:record:${userId}:${cacheHash(id)}`
}

export function createOwnedDataController(options: OwnedDataControllerOptions) {
  const list: RequestHandler = async (req, res, next) => {
    try {
      const listOptions = {
        cursor: queryString(req.query.cursor),
        limit: queryLimit(req.query.limit),
      }
      if (listOptions.cursor || listOptions.limit) {
        const page = await listOwned(options.model, req.astraAuth!, {}, listOptions)
        return ok(res, {
          items: page.items,
          page: page.page,
          cache: 'bypass',
        })
      }
      const key = listCacheKey(options.resource, req.astraAuth!.userId, listOptions)
      const result = await cached(key, 60, () => listOwned(options.model, req.astraAuth!, {}, listOptions))
      return ok(res, {
        items: result.value.items,
        page: result.value.page,
        cache: result.cache,
      })
    } catch (error) {
      return next(error)
    }
  }

  const create: RequestHandler = async (req, res, next) => {
    try {
      const item = await createOwned(options.model, req.astraAuth!, req.body)
      await deleteCached(listCacheKey(options.resource, req.astraAuth!.userId))
      return created(res, item)
    } catch (error) {
      return next(error)
    }
  }

  const update: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id)
      const item = await updateOwned(options.model, req.astraAuth!, id, req.body)
      await Promise.all([
        deleteCached(listCacheKey(options.resource, req.astraAuth!.userId)),
        deleteCached(recordCacheKey(options.resource, req.astraAuth!.userId, id)),
      ])
      return ok(res, item)
    } catch (error) {
      return next(error)
    }
  }

  const remove: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id)
      const item = await softDeleteOwned(options.model, req.astraAuth!, id)
      await Promise.all([
        deleteCached(listCacheKey(options.resource, req.astraAuth!.userId)),
        deleteCached(recordCacheKey(options.resource, req.astraAuth!.userId, id)),
      ])
      return ok(res, item)
    } catch (error) {
      return next(error)
    }
  }

  return { list, create, update, remove }
}
