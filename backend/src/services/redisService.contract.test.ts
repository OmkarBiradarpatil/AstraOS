import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisMock = vi.hoisted(() => ({
  client: null as null | {
    del: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    ping: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
  },
  fromEnv: vi.fn(() => redisMock.client),
}))

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: redisMock.fromEnv,
  },
}))

async function loadRedisService() {
  vi.resetModules()
  return import('./redisService.js')
}

describe('redis service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    redisMock.client = null
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('uses memory fallback until the TTL boundary, then expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))
    const redis = await loadRedisService()

    await redis.setCachedJson('memory:key', { value: 1 }, 5)

    vi.setSystemTime(new Date('2026-06-08T12:00:04.999Z'))
    await expect(redis.getCachedJson('memory:key')).resolves.toEqual({ value: 1 })

    vi.setSystemTime(new Date('2026-06-08T12:00:05.000Z'))
    await expect(redis.getCachedJson('memory:key')).resolves.toBeNull()
    expect(redisMock.fromEnv).not.toHaveBeenCalled()
  })

  it('calls the cached loader only on misses and reloads after TTL expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))
    const redis = await loadRedisService()
    const loader = vi.fn()
      .mockResolvedValueOnce({ answer: 1 })
      .mockResolvedValueOnce({ answer: 2 })

    await expect(redis.cached('cached:key', 10, loader)).resolves.toEqual({ value: { answer: 1 }, cache: 'miss' })
    await expect(redis.cached('cached:key', 10, loader)).resolves.toEqual({ value: { answer: 1 }, cache: 'hit' })

    vi.setSystemTime(new Date('2026-06-08T12:00:10.000Z'))
    await expect(redis.cached('cached:key', 10, loader)).resolves.toEqual({ value: { answer: 2 }, cache: 'miss' })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('uses Upstash get/set/del when Redis env is configured', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token'
    redisMock.client = {
      del: vi.fn(async () => 1),
      get: vi.fn(async () => ({ from: 'redis' })),
      ping: vi.fn(async () => 'PONG'),
      set: vi.fn(async () => 'OK'),
    }
    const redis = await loadRedisService()

    await expect(redis.getCachedJson('redis:key')).resolves.toEqual({ from: 'redis' })
    await redis.setCachedJson('redis:key', { saved: true }, 30)
    await redis.deleteCached('redis:key')
    await expect(redis.redisHealth()).resolves.toMatchObject({
      configured: true,
      connected: true,
      healthy: true,
    })

    expect(redisMock.fromEnv).toHaveBeenCalledTimes(1)
    expect(redisMock.client.get).toHaveBeenCalledWith('redis:key')
    expect(redisMock.client.set).toHaveBeenCalledWith('redis:key', { saved: true }, { ex: 30 })
    expect(redisMock.client.del).toHaveBeenCalledWith('redis:key')
    expect(redisMock.client.ping).toHaveBeenCalled()
  })

  it('reports Redis health for unconfigured and failed clients', async () => {
    let redis = await loadRedisService()
    await expect(redis.redisHealth()).resolves.toEqual({
      configured: false,
      connected: false,
      healthy: false,
    })

    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token'
    redisMock.client = {
      del: vi.fn(),
      get: vi.fn(),
      ping: vi.fn(async () => {
        throw new Error('redis down')
      }),
      set: vi.fn(),
    }
    redis = await loadRedisService()

    await expect(redis.redisHealth()).resolves.toMatchObject({
      configured: true,
      connected: false,
      error: 'redis down',
      healthy: false,
    })
  })

  it('bypasses cache when Redis get or set fails instead of blocking the loader', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token'
    redisMock.client = {
      del: vi.fn(),
      get: vi.fn(async () => {
        throw new Error('redis get down')
      }),
      ping: vi.fn(),
      set: vi.fn(),
    }
    let redis = await loadRedisService()
    const getFailureLoader = vi.fn(async () => ({ fresh: 'from-loader' }))

    await expect(redis.cached('cache:get-fails', 30, getFailureLoader)).resolves.toEqual({
      value: { fresh: 'from-loader' },
      cache: 'bypass',
    })
    expect(getFailureLoader).toHaveBeenCalledTimes(1)

    redisMock.client = {
      del: vi.fn(),
      get: vi.fn(async () => null),
      ping: vi.fn(),
      set: vi.fn(async () => {
        throw new Error('redis set down')
      }),
    }
    redis = await loadRedisService()
    const setFailureLoader = vi.fn(async () => ({ fresh: 'after-set-failure' }))

    await expect(redis.cached('cache:set-fails', 30, setFailureLoader)).resolves.toEqual({
      value: { fresh: 'after-set-failure' },
      cache: 'bypass',
    })
    expect(setFailureLoader).toHaveBeenCalledTimes(1)
  })
})
