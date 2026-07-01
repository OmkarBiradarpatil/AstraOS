import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/

export const requestId: RequestHandler = (req, res, next) => {
  const header = req.header('x-request-id')
  req.requestId = header && REQUEST_ID_PATTERN.test(header) ? header : randomUUID()
  res.setHeader('x-request-id', req.requestId)
  next()
}
