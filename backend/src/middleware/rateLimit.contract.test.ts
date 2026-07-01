import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { getRedisClient } from '../services/redisService.js'
import { rateLimit } from './rateLimit.js'

vi.mock('../services/redisService.js', () => ({
  getRedisClient: vi.fn(),
}))

function mockResponse() {
  return {
    setHeader: vi.fn(),
  } as unknown as Response
}

function mockRequest(userId: string) {
  return {
    astraAuth: { userId },
    ip: '127.0.0.1',
  } as unknown as Request
}

describe('rate limit middleware contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('uses Redis counters with sanitized owner identity and expiry on first hit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))
    const redis = {
      expire: vi.fn(async () => 1),
      incr: vi.fn(async () => 1),
    }
    vi.mocked(getRedisClient).mockReturnValue(redis as never)
    const res = mockResponse()
    const next = vi.fn()

    await rateLimit({ namespace: 'ai', limit: 2, windowSeconds: 60 })(
      mockRequest('user/with unsafe spaces'),
      res,
      next,
    )

    expect(redis.incr).toHaveBeenCalledWith(expect.stringMatching(/^rl:ai:user_with_unsafe_spaces:/))
    expect(redis.expire).toHaveBeenCalledWith(expect.stringMatching(/^rl:ai:user_with_unsafe_spaces:/), 60)
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '2')
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '1')
    expect(next).toHaveBeenCalledWith()
  })

  it('returns a rate-limited ApiError and retry guidance when Redis count exceeds limit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))
    const redis = {
      expire: vi.fn(async () => 1),
      incr: vi.fn(async () => 3),
    }
    vi.mocked(getRedisClient).mockReturnValue(redis as never)
    const res = mockResponse()
    const next = vi.fn()

    await rateLimit({ namespace: 'upload', limit: 2, windowSeconds: 60 })(
      mockRequest('user_a'),
      res,
      next,
    )

    expect(redis.expire).not.toHaveBeenCalled()
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '0')
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: 'RATE_LIMITED',
      status: 429,
    }))
  })

  it('caps memory fallback counters by evicting the oldest identities', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))
    vi.mocked(getRedisClient).mockReturnValue(null)
    const limiter = rateLimit({ namespace: 'memory-cap', limit: 1, windowSeconds: 3600 })

    await limiter(mockRequest('oldest-user'), mockResponse(), vi.fn())
    for (let index = 0; index < 2005; index += 1) {
      await limiter(mockRequest(`new-user-${index}`), mockResponse(), vi.fn())
    }

    const res = mockResponse()
    const next = vi.fn()
    await limiter(mockRequest('oldest-user'), res, next)

    expect(res.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.any(String))
    expect(next).toHaveBeenCalledWith()
  })
})
