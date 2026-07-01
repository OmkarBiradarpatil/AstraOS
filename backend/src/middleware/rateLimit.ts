import type { Response, RequestHandler } from 'express'
import { ApiError } from '../utils/http.js'
import { getRedisClient } from '../services/redisService.js'

interface RateLimitOptions {
  namespace: string
  limit: number
  windowSeconds: number
}

const memoryCounters = new Map<string, { count: number; expiresAt: number }>()
const MEMORY_COUNTER_MAX_ENTRIES = 2000
let cleanupTick = 0

function sanitizeIdentity(identity: string) {
  return identity.replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 160)
}

function cleanupExpiredMemoryCounters(now: number) {
  cleanupTick += 1
  if (cleanupTick % 100 !== 0 && memoryCounters.size < MEMORY_COUNTER_MAX_ENTRIES) return

  for (const [key, value] of memoryCounters.entries()) {
    if (value.expiresAt <= now) memoryCounters.delete(key)
  }

  while (memoryCounters.size > MEMORY_COUNTER_MAX_ENTRIES) {
    const oldestKey = memoryCounters.keys().next().value as string | undefined
    if (!oldestKey) break
    memoryCounters.delete(oldestKey)
  }
}

function setRateLimitHeaders(res: Response, options: RateLimitOptions, count: number, resetAt: number) {
  const remaining = Math.max(options.limit - count, 0)
  const resetSeconds = Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1)

  res.setHeader('RateLimit-Limit', String(options.limit))
  res.setHeader('RateLimit-Remaining', String(remaining))
  res.setHeader('RateLimit-Reset', String(resetSeconds))

  if (count > options.limit) {
    res.setHeader('Retry-After', String(resetSeconds))
  }
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const now = Date.now()
    const windowMs = options.windowSeconds * 1000
    const identity = sanitizeIdentity(req.astraAuth?.userId ?? req.ip ?? 'anonymous')
    const bucket = Math.floor(now / windowMs)
    const resetAt = (bucket + 1) * windowMs
    const key = `rl:${options.namespace}:${identity}:${bucket}`

    try {
      const redis = getRedisClient()
      if (redis) {
        const count = await redis.incr(key)
        if (count === 1) await redis.expire(key, options.windowSeconds)
        setRateLimitHeaders(res, options, count, resetAt)
        if (count > options.limit) {
          return next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.'))
        }
        return next()
      }

      cleanupExpiredMemoryCounters(now)
      const current = memoryCounters.get(key)
      if (!current || current.expiresAt <= now) {
        memoryCounters.set(key, { count: 1, expiresAt: resetAt })
        setRateLimitHeaders(res, options, 1, resetAt)
        return next()
      }
      current.count += 1
      setRateLimitHeaders(res, options, current.count, current.expiresAt)
      if (current.count > options.limit) {
        return next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.'))
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
