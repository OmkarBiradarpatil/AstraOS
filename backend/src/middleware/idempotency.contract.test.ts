import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { getCachedJson, setCachedJson } from '../services/redisService.js'
import { idempotency } from './idempotency.js'

vi.mock('../services/redisService.js', () => ({
  cacheHash: (input: string) => `hash_${Buffer.from(input).toString('hex')}`,
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
}))

function mockRequest(headers: Record<string, string> = {}) {
  return {
    astraAuth: { userId: 'user_a' },
    baseUrl: '/api',
    body: { title: 'Create once' },
    header(name: string) {
      return headers[name.toLowerCase()]
    },
    method: 'POST',
    path: '/tasks',
    requestId: 'req_1',
  } as Request
}

function mockResponse() {
  const response = {
    json: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn(),
    statusCode: 201,
  } as unknown as Response
  vi.mocked(response.json).mockReturnValue(response)
  vi.mocked(response.status).mockReturnValue(response)
  return response
}

function flushPromises() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('idempotency middleware availability contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bypasses idempotency and lets the route run when cache reads fail', async () => {
    vi.mocked(getCachedJson).mockRejectedValueOnce(new Error('redis get down'))
    const req = mockRequest({ 'x-idempotency-key': 'task-key-123' })
    const res = mockResponse()
    const next = vi.fn()

    await idempotency({ namespace: 'tasks' })(req, res, next as NextFunction)

    expect(res.setHeader).toHaveBeenCalledWith('x-idempotency-status', 'bypass')
    expect(next).toHaveBeenCalledWith()
  })

  it('labels successful route responses as bypass when cache writes fail', async () => {
    vi.mocked(getCachedJson).mockResolvedValueOnce(null)
    vi.mocked(setCachedJson).mockRejectedValueOnce(new Error('redis set down'))
    const req = mockRequest({ 'x-idempotency-key': 'task-key-456' })
    const res = mockResponse()
    const originalJson = res.json
    const next = vi.fn()

    await idempotency({ namespace: 'tasks' })(req, res, next as NextFunction)
    res.json({ ok: true, data: { id: 'created' }, requestId: 'req_1' })
    await flushPromises()

    expect(next).toHaveBeenCalledWith()
    expect(res.setHeader).toHaveBeenCalledWith('x-idempotency-status', 'miss')
    expect(res.setHeader).toHaveBeenCalledWith('x-idempotency-status', 'bypass')
    expect(res.setHeader).not.toHaveBeenCalledWith('x-idempotency-status', 'stored')
    expect(originalJson).toHaveBeenCalledWith({ ok: true, data: { id: 'created' }, requestId: 'req_1' })
  })
})
