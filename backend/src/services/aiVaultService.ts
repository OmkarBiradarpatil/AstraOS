import { createHash } from 'node:crypto'
import { AiVaultChunkModel } from '../models/aiVaultChunk.js'
import { AiVaultDocumentModel } from '../models/aiVaultDocument.js'
import { ApiError } from '../utils/http.js'
import type { AiVaultDocumentInput } from '../validators/aiVault.js'
import { connectMongo, isMongoConfigured } from './database.js'
import { deleteUserCloudinaryAsset, getUserCloudinaryAssetMetadata } from './cloudinaryService.js'

interface OwnerContext {
  userId: string
  orgId?: string
}

interface ListVaultDocumentsOptions {
  cursor?: string
  limit?: number
}

const DEFAULT_VAULT_LIST_LIMIT = 100
const MAX_VAULT_LIST_LIMIT = 200
const CURSOR_SEPARATOR = '|'
const MONGO_ID_PATTERN = /^[a-f\d]{24}$/i

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

function cloudinaryOwnerContext(userId: string) {
  return userId.trim()
}

async function requireMongo() {
  if (!isMongoConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'MongoDB is not configured.')
  await connectMongo()
}

function boundedVaultLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return DEFAULT_VAULT_LIST_LIMIT
  return Math.min(Math.max(Math.round(limit ?? DEFAULT_VAULT_LIST_LIMIT), 1), MAX_VAULT_LIST_LIMIT)
}

function parseVaultCursor(cursor: string | undefined) {
  if (!cursor) return undefined
  const [datePart, idPart] = cursor.split(CURSOR_SEPARATOR)
  if (!datePart) {
    throw new ApiError(400, 'INVALID_CURSOR', 'List cursor must be a valid ISO date.')
  }
  const cursorDate = new Date(datePart)
  if (Number.isNaN(cursorDate.getTime())) {
    throw new ApiError(400, 'INVALID_CURSOR', 'List cursor must be a valid ISO date.')
  }
  if (idPart && !MONGO_ID_PATTERN.test(idPart)) {
    throw new ApiError(400, 'INVALID_CURSOR', 'List cursor id must be a valid Mongo id.')
  }
  return { updatedAt: cursorDate, id: idPart }
}

function vaultCursorQuery(cursor: string | undefined) {
  const parsed = parseVaultCursor(cursor)
  if (!parsed) return {}
  if (!parsed.id) return { updatedAt: { $lt: parsed.updatedAt } }
  return {
    $or: [
      { updatedAt: { $lt: parsed.updatedAt } },
      { updatedAt: parsed.updatedAt, _id: { $lt: parsed.id } },
    ],
  }
}

function nextVaultCursor(record: { _id?: unknown; updatedAt?: Date | string } | undefined) {
  if (!record?.updatedAt || !record._id) return null
  return `${new Date(record.updatedAt).toISOString()}${CURSOR_SEPARATOR}${String(record._id)}`
}

async function verifyUploadedAsset(owner: OwnerContext, input: AiVaultDocumentInput) {
  if (!input.cloudinaryPublicId) return
  const asset = await getUserCloudinaryAssetMetadata(
    owner.userId,
    input.cloudinaryPublicId,
    input.cloudinaryResourceType ?? 'raw',
  ) as { bytes?: number; context?: { custom?: Record<string, string> } }
  if (typeof asset.bytes === 'number' && asset.bytes !== input.bytes) {
    throw new ApiError(400, 'ASSET_BYTES_MISMATCH', 'Uploaded asset size does not match document metadata.')
  }
  const context = asset.context?.custom
  if (context?.owner_id !== cloudinaryOwnerContext(owner.userId)) {
    throw new ApiError(403, 'FORBIDDEN_ASSET', 'Uploaded asset owner metadata does not match the authenticated user.')
  }
  if (context?.content_type !== input.contentType) {
    throw new ApiError(400, 'ASSET_CONTENT_TYPE_MISMATCH', 'Uploaded asset content type does not match document metadata.')
  }
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function chunkText(text: string, maxChars = 1800, overlapChars = 160) {
  const chunks: string[] = []
  let index = 0
  while (index < text.length) {
    const end = Math.min(text.length, index + maxChars)
    const slice = text.slice(index, end).trim()
    if (slice) chunks.push(slice)
    if (end >= text.length) break
    index = Math.max(0, end - overlapChars)
  }
  return chunks
}

export async function registerAiVaultDocument(owner: OwnerContext, input: AiVaultDocumentInput) {
  await requireMongo()
  await verifyUploadedAsset(owner, input)
  const existing = await AiVaultDocumentModel.findOne({
    ownerId: owner.userId,
    contentHash: input.contentHash,
  })
  if (existing && !existing.deletedAt) return existing.toObject()
  if (existing) {
    existing.set({
      ...input,
      orgId: owner.orgId ?? null,
      status: 'queued',
      cloudinaryResourceType: input.cloudinaryResourceType ?? null,
      cloudinaryPublicId: input.cloudinaryPublicId ?? null,
      originalFilename: input.originalFilename ?? '',
      contentType: input.contentType ?? '',
      deletedAt: null,
      errorMessage: '',
    })
    await existing.save()
    return existing.toObject()
  }

  return AiVaultDocumentModel.create({
    ...input,
    ownerId: owner.userId,
    orgId: owner.orgId ?? null,
    status: 'queued',
    cloudinaryResourceType: input.cloudinaryResourceType ?? null,
    cloudinaryPublicId: input.cloudinaryPublicId ?? null,
    originalFilename: input.originalFilename ?? '',
    contentType: input.contentType ?? '',
  })
}

export async function listAiVaultDocuments(owner: OwnerContext, options: ListVaultDocumentsOptions = {}) {
  const limit = boundedVaultLimit(options.limit)
  const cursorFilter = vaultCursorQuery(options.cursor)
  await requireMongo()
  const records = await AiVaultDocumentModel.find({
    ownerId: owner.userId,
    deletedAt: null,
    ...cursorFilter,
  }).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).lean()
  const documents = records.slice(0, limit)
  const last = documents.at(-1) as { updatedAt?: Date | string } | undefined
  return {
    documents,
    page: {
      limit,
      hasMore: records.length > limit,
      nextCursor: records.length > limit ? nextVaultCursor(last) : null,
    },
  }
}

export async function deleteAiVaultDocument(owner: OwnerContext, id: string) {
  await requireMongo()
  const doc = await AiVaultDocumentModel.findOne({ _id: id, ownerId: owner.userId, deletedAt: null })
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'AI Vault document was not found.')

  if (doc.cloudinaryPublicId) {
    await deleteUserCloudinaryAsset(owner.userId, doc.cloudinaryPublicId, doc.cloudinaryResourceType ?? 'raw')
  }

  await AiVaultChunkModel.deleteMany({ ownerId: owner.userId, documentId: doc._id })
  doc.deletedAt = new Date()
  await doc.save()
  return { id, deleted: true }
}

export async function ingestAiVaultText(owner: OwnerContext, id: string, text: string) {
  await requireMongo()
  const doc = await AiVaultDocumentModel.findOne({ _id: id, ownerId: owner.userId, deletedAt: null })
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'AI Vault document was not found.')

  const normalized = normalizeText(text)
  if (!normalized) throw new ApiError(400, 'EMPTY_TEXT', 'Document text is empty after normalization.')

  doc.status = 'processing'
  await doc.save()

  const chunks = chunkText(normalized)
  await AiVaultChunkModel.deleteMany({ ownerId: owner.userId, documentId: doc._id })
  if (chunks.length) {
    await AiVaultChunkModel.insertMany(
      chunks.map((content, index) => ({
        ownerId: owner.userId,
        orgId: owner.orgId ?? null,
        documentId: doc._id,
        index,
        content,
        charCount: content.length,
      })),
    )
  }

  doc.status = 'ready'
  doc.chunkCount = chunks.length
  doc.extractedTextHash = sha256(normalized)
  doc.extractedAt = new Date()
  doc.errorMessage = ''
  await doc.save()

  return {
    document: doc.toObject(),
    chunkCount: chunks.length,
  }
}
