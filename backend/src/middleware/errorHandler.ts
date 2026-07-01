import type { ErrorRequestHandler } from 'express'
import { ApiError } from '../utils/http.js'
import { logger } from '../utils/logger.js'

interface HttpLikeError {
  body?: unknown
  expose?: boolean
  message?: string
  status?: number
  statusCode?: number
  type?: string
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 11000)
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return Boolean(error && typeof error === 'object')
}

function clientErrorFromParser(error: unknown) {
  if (!isHttpLikeError(error)) return undefined
  const httpError = error as HttpLikeError

  if (httpError.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')
  }

  if (error instanceof SyntaxError && 'body' in httpError) {
    return new ApiError(400, 'INVALID_JSON', 'Request body contains invalid JSON.')
  }

  if (httpError.status === 415 || httpError.statusCode === 415) {
    return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request content type is not supported.')
  }

  return undefined
}

export const notFound: ErrorRequestHandler = (error, req, res, next) => {
  next(error)
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const apiError = error instanceof ApiError ? error : clientErrorFromParser(error)

  if (apiError) {
    return res.status(apiError.status).json({
      ok: false,
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
      },
      requestId: req.requestId,
    })
  }

  if (isDuplicateKeyError(error)) {
    return res.status(409).json({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'A record with the same unique value already exists.',
      },
      requestId: req.requestId,
    })
  }

  logger.error('Unhandled API error', {
    requestId: req.requestId,
    error: error instanceof Error ? error.message : String(error),
  })

  return res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong.',
    },
    requestId: req.requestId,
  })
}
