import type { RequestHandler } from 'express'
import { ok } from '../utils/http.js'

export const healthController: RequestHandler = async (_req, res, next) => {
  try {
    return ok(res, {
      service: 'astraos-api',
      status: 'ok',
      time: new Date().toISOString(),
    })
  } catch (error) {
    return next(error)
  }
}
