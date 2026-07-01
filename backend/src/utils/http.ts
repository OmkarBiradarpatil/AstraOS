import type { Response } from 'express'

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    ok: true,
    data,
    requestId: res.req.requestId,
  })
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, 201)
}
