import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { env } from '../utils/env.js'
import { ApiError } from '../utils/http.js'

function bearerToken(value: string | undefined) {
  if (!value?.startsWith('Bearer ')) return undefined
  return value.slice('Bearer '.length).trim()
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export const requireOpsAccess: RequestHandler = (req, _res, next) => {
  const expected = env('ASTRAOS_OPS_TOKEN')
  if (!expected && process.env.NODE_ENV !== 'production') return next()
  if (!expected) {
    return next(new ApiError(503, 'OPS_AUTH_NOT_CONFIGURED', 'Operations access is not configured.'))
  }
  if (process.env.NODE_ENV === 'production' && expected.length < 32) {
    return next(new ApiError(503, 'OPS_AUTH_WEAK', 'Operations token must be at least 32 characters in production.'))
  }

  const provided = req.header('x-astra-ops-token') ?? bearerToken(req.header('authorization'))
  if (!provided || !constantTimeEqual(provided, expected)) {
    return next(new ApiError(401, 'OPS_UNAUTHORIZED', 'Operations token is required.'))
  }

  return next()
}
