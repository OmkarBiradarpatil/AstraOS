import type { Request, RequestHandler } from 'express'
import { cacheHash, getCachedJson, setCachedJson } from '../services/redisService.js'
import { ApiError } from '../utils/http.js'

interface IdempotencyOptions {
  namespace: string
  ttlSeconds?: number
}

interface IdempotencyRecord {
  bodyHash: string
  data: unknown
  status: number
}

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9._:-]{8,160}$/

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function idempotencyHeader(req: Request) {
  const value = req.header('x-idempotency-key')?.trim()
  if (!value) return undefined
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be 8-160 safe characters.')
  }
  return value
}

function cacheKey(options: IdempotencyOptions, userId: string, route: string, key: string) {
  return `idempo:${options.namespace}:${cacheHash(userId)}:${cacheHash(route)}:${cacheHash(key)}`
}

export function idempotency(options: IdempotencyOptions): RequestHandler {
  const ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60

  return async (req, res, next) => {
    try {
      const key = idempotencyHeader(req)
      if (!key) return next()
      if (!req.astraAuth?.userId) {
        return next(new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.'))
      }

      const route = `${req.method}:${req.baseUrl}${req.path}`
      const bodyHash = cacheHash(stableStringify(req.body ?? null))
      let stored: IdempotencyRecord | null
      try {
        stored = await getCachedJson<IdempotencyRecord>(cacheKey(options, req.astraAuth.userId, route, key))
      } catch {
        res.setHeader('x-idempotency-status', 'bypass')
        return next()
      }

      if (stored) {
        if (stored.bodyHash !== bodyHash) {
          return next(new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'Idempotency key was already used with a different request body.'))
        }
        res.setHeader('x-idempotency-replayed', 'true')
        res.setHeader('x-idempotency-status', 'hit')
        return res.status(stored.status).json({
          ok: true,
          data: stored.data,
          requestId: req.requestId,
        })
      }

      const originalJson = res.json.bind(res)
      res.setHeader('x-idempotency-status', 'miss')
      res.json = ((body: unknown) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && body && typeof body === 'object') {
          const envelope = body as { data?: unknown; ok?: unknown }
          if (envelope.ok === true) {
            void setCachedJson(cacheKey(options, req.astraAuth!.userId, route, key), {
              bodyHash,
              data: envelope.data,
              status: res.statusCode,
            } satisfies IdempotencyRecord, ttlSeconds)
              .then(() => {
                res.setHeader('x-idempotency-status', 'stored')
              })
              .catch(() => {
                res.setHeader('x-idempotency-status', 'bypass')
              })
              .finally(() => {
                originalJson(body)
              })
            return res
          }
        }
        return originalJson(body)
      }) as typeof res.json

      return next()
    } catch (error) {
      return next(error)
    }
  }
}
