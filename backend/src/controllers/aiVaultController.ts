import type { RequestHandler } from 'express'
import { listUserCloudinaryAssets } from '../services/cloudinaryService.js'
import {
  deleteAiVaultDocument,
  ingestAiVaultText,
  listAiVaultDocuments,
  registerAiVaultDocument,
} from '../services/aiVaultService.js'
import type { AiVaultDocumentInput, AiVaultIngestTextInput } from '../validators/aiVault.js'
import { ApiError, created, ok } from '../utils/http.js'

function queryString(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined
}

function queryLimit(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'INVALID_LIMIT', 'List limit must be an integer from 1 to 200.')
  }
  const raw = Number(value)
  if (!Number.isInteger(raw) || raw < 1 || raw > 200) {
    throw new ApiError(400, 'INVALID_LIMIT', 'List limit must be an integer from 1 to 200.')
  }
  return raw
}

export const listAiVaultDocumentsController: RequestHandler = async (req, res, next) => {
  try {
    const result = await listAiVaultDocuments(req.astraAuth!, {
      cursor: queryString(req.query.cursor),
      limit: queryLimit(req.query.limit),
    })
    return ok(res, result)
  } catch (error) {
    return next(error)
  }
}

export const registerAiVaultDocumentController: RequestHandler = async (req, res, next) => {
  try {
    const document = await registerAiVaultDocument(req.astraAuth!, req.body as AiVaultDocumentInput)
    return created(res, document)
  } catch (error) {
    return next(error)
  }
}

export const deleteAiVaultDocumentController: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteAiVaultDocument(req.astraAuth!, String(req.params.id))
    return ok(res, result)
  } catch (error) {
    return next(error)
  }
}

export const ingestAiVaultTextController: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as AiVaultIngestTextInput
    const result = await ingestAiVaultText(req.astraAuth!, String(req.params.id), body.text)
    return ok(res, result)
  } catch (error) {
    return next(error)
  }
}

export const listAiVaultCloudinaryAssetsController: RequestHandler = async (req, res, next) => {
  try {
    const assets = await listUserCloudinaryAssets(req.astraAuth!.userId)
    return ok(res, { assets })
  } catch (error) {
    return next(error)
  }
}
