import { Redis } from '@upstash/redis'
import { createHash } from 'node:crypto'
import { env } from '../utils/env.js'

type CacheRecord = { value: unknown; expiresAt: number }

const memoryCache = new Map<string, CacheRecord>()
const MEMORY_CACHE_MAX_ENTRIES = 2000
let memoryCacheCleanupTick = 0
let redisInstance: Redis | null | undefined

export function getRedisClient() {
  if (redisInstance !== undefined) return redisInstance
  if (!env('UPSTASH_REDIS_REST_URL') || !env('UPSTASH_REDIS_REST_TOKEN')) {
    redisInstance = null
    return redisInstance
  }
  redisInstance = Redis.fromEnv()
  return redisInstance
}

export async function redisHealth() {
  const redis = getRedisClient()
  if (!redis) return { configured: false, connected: false, healthy: false }
  try {
    await redis.ping()
    return { configured: true, connected: true, healthy: true }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      healthy: false,
      error: error instanceof Error ? error.message : 'Redis health check failed.',
    }
  }
}

export function cacheHash(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

function cleanupExpiredMemoryCache(now = Date.now()) {
  memoryCacheCleanupTick += 1
  if (memoryCacheCleanupTick % 100 !== 0 && memoryCache.size < MEMORY_CACHE_MAX_ENTRIES) return

  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt <= now) memoryCache.delete(key)
  }

  while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value as string | undefined
    if (!oldestKey) break
    memoryCache.delete(oldestKey)
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedisClient()
  if (redis) {
    const value = await redis.get<T>(key)
    return value ?? null
  }

  cleanupExpiredMemoryCache()
  const value = memoryCache.get(key)
  if (!value || value.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return null
  }
  return value.value as T
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number) {
  const redis = getRedisClient()
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds })
    return
  }
  cleanupExpiredMemoryCache()
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

export async function deleteCached(key: string) {
  const redis = getRedisClient()
  if (redis) {
    await redis.del(key)
    return
  }
  memoryCache.delete(key)
}

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>) {
  let cacheAvailable = true
  try {
    const existing = await getCachedJson<T>(key)
    if (existing !== null) return { value: existing, cache: 'hit' as const }
  } catch {
    cacheAvailable = false
  }

  const value = await loader()
  if (!cacheAvailable) return { value, cache: 'bypass' as const }

  try {
    await setCachedJson(key, value, ttlSeconds)
    return { value, cache: 'miss' as const }
  } catch {
    return { value, cache: 'bypass' as const }
  }
}
