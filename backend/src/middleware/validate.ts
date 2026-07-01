import type { RequestHandler } from 'express'
import type { ZodSchema } from 'zod'
import { ApiError } from '../utils/http.js'

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(400, 'VALIDATION_FAILED', 'Request body validation failed.', parsed.error.flatten()))
    }
    req.body = parsed.data
    return next()
  }
}

export function validateParams(schema: ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) {
      return next(new ApiError(400, 'VALIDATION_FAILED', 'Request params validation failed.', parsed.error.flatten()))
    }
    req.params = parsed.data as typeof req.params
    return next()
  }
}
