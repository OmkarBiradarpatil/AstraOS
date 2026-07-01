import type { RequestHandler } from 'express'
import { createUploadSignature } from '../services/cloudinaryService.js'
import type { UploadSignatureInput } from '../validators/upload.js'
import { ok } from '../utils/http.js'

export const uploadSignatureController: RequestHandler = (req, res, next) => {
  try {
    const body = req.body as UploadSignatureInput
    const signature = createUploadSignature(body, req.astraAuth!.userId)
    return ok(res, signature)
  } catch (error) {
    return next(error)
  }
}
