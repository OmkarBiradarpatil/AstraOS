import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { getAuth } from '@clerk/express'
import { syncUserProfile } from '../services/userService.js'
import { requireAstraAuth } from './auth.js'

vi.mock('@clerk/express', () => ({
  getAuth: vi.fn(),
}))

vi.mock('../services/userService.js', () => ({
  syncUserProfile: vi.fn(async () => null),
}))

function requestWithHeaders(headers: Record<string, string> = {}) {
  return {
    header(name: string) {
      return headers[name.toLowerCase()]
    },
  } as Request
}

describe('auth middleware contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    delete process.env.ASTRAOS_ALLOW_DEV_AUTH
    delete process.env.CLERK_PUBLISHABLE_KEY
    delete process.env.CLERK_SECRET_KEY
  })

  it('does not trust dev profile headers during Clerk-backed auth', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CLERK_SECRET_KEY = 'test-clerk-secret'
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_auth'
    vi.mocked(getAuth).mockReturnValue({
      sessionClaims: {},
      userId: 'user_123',
    } as ReturnType<typeof getAuth>)
    const req = requestWithHeaders({
      'x-astra-dev-email': 'spoof@example.com',
      'x-astra-dev-name': 'Spoofed Name',
    })
    const next = vi.fn()

    await requireAstraAuth(req, {} as Response, next as NextFunction)

    expect(syncUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      email: undefined,
      name: undefined,
      userId: 'user_123',
    }))
    expect(req.astraAuth?.userId).toBe('user_123')
    expect(next).toHaveBeenCalledWith()
  })

  it('allows dev profile headers only in explicit non-production dev auth', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const req = requestWithHeaders({
      'x-astra-dev-email': 'dev@example.com',
      'x-astra-dev-name': 'Dev User',
      'x-astra-dev-role': 'teacher',
      'x-astra-dev-user': 'dev_user',
    })
    const next = vi.fn()

    await requireAstraAuth(req, {} as Response, next as NextFunction)

    expect(getAuth).not.toHaveBeenCalled()
    expect(syncUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      email: 'dev@example.com',
      name: 'Dev User',
      role: 'teacher',
      userId: 'dev_user',
    }))
    expect(next).toHaveBeenCalledWith()
  })
})
