import { apiClient } from '../../lib/api/apiClient'
import type { CloudRecord } from '../../lib/api/cloudRecords'

const MAX_VAULT_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_VAULT_UPLOAD_TYPES = [
  /^application\/pdf$/i,
  /^application\/json$/i,
  /^application\/msword$/i,
  /^application\/vnd\.openxmlformats-officedocument\./i,
  /^text\/(plain|markdown|csv|tab-separated-values)$/i,
  /^image\/(png|jpe?g|webp|gif)$/i,
]

export interface UploadSignatureResponse {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  publicId: string
  resourceType: 'image' | 'video' | 'raw' | 'auto'
  signature: string
  uploadParams?: {
    context: string
    folder: string
    overwrite: string
    public_id: string
    resource_type: 'image' | 'video' | 'raw' | 'auto'
    signature: string
    timestamp: number
    unique_filename: string
  }
}

export interface CloudinaryUploadResponse {
  bytes: number
  created_at?: string
  etag?: string
  format?: string
  original_filename?: string
  public_id: string
  resource_type: string
  secure_url?: string
}

export interface VaultUploadDependencies {
  createSignature: (input: {
    bytes: number
    contentType: string
    folderId: string
    idempotencyKey?: string
  }) => Promise<UploadSignatureResponse>
  registerDocument: (input: Record<string, unknown>, idempotencyKey?: string) => Promise<CloudRecord>
  uploadToCloudinary: (signature: UploadSignatureResponse, file: File) => Promise<CloudinaryUploadResponse>
}

export interface UploadVaultFileInput {
  file: File
  folderId: string
}

export class VaultUploadRegistrationError extends Error {
  recovery: Record<string, unknown>

  constructor(message: string, recovery: Record<string, unknown>) {
    super(message)
    this.name = 'VaultUploadRegistrationError'
    this.recovery = recovery
  }
}

function stableHash(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `vault_${(hash >>> 0).toString(16)}`
}

function isAllowedContentType(contentType: string) {
  return ALLOWED_VAULT_UPLOAD_TYPES.some((pattern) => pattern.test(contentType))
}

function fileContentType(file: File) {
  return file.type.trim() || 'application/octet-stream'
}

export function validateVaultUploadFile(file: File) {
  const contentType = fileContentType(file)
  if (!file.name.trim()) throw new Error('Choose a named file before uploading.')
  if (file.size <= 0) throw new Error('Choose a non-empty file before uploading.')
  if (file.size > MAX_VAULT_UPLOAD_BYTES) throw new Error('AI Vault uploads must be 10 MB or smaller.')
  if (!isAllowedContentType(contentType)) throw new Error('This file type is not allowed for AI Vault uploads.')
  return contentType
}

export function buildCloudinaryUploadFormData(signature: UploadSignatureResponse, file: File) {
  const formData = new FormData()
  const uploadParams = signature.uploadParams ?? {
    context: `content_type=${fileContentType(file)}|bytes=${file.size}`,
    folder: signature.folder,
    overwrite: 'false',
    public_id: signature.publicId,
    resource_type: signature.resourceType,
    signature: signature.signature,
    timestamp: signature.timestamp,
    unique_filename: 'false',
  }
  formData.set('file', file)
  formData.set('api_key', signature.apiKey)
  for (const [key, value] of Object.entries(uploadParams)) {
    formData.set(key, String(value))
  }
  return formData
}

async function defaultCloudinaryUpload(signature: UploadSignatureResponse, file: File) {
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/${signature.resourceType}/upload`
  const response = await fetch(url, {
    method: 'POST',
    body: buildCloudinaryUploadFormData(signature, file),
  })
  const payload = await response.json().catch(() => null) as Partial<CloudinaryUploadResponse> | null
  if (!response.ok || !payload?.public_id) {
    throw new Error(payload && 'error' in payload ? 'Cloudinary upload failed.' : `Cloudinary upload failed with ${response.status}.`)
  }
  return payload as CloudinaryUploadResponse
}

export const defaultVaultUploadDependencies: VaultUploadDependencies = {
  createSignature(input) {
    return apiClient.post<UploadSignatureResponse>('/uploads/signature', {
      folder: `ai-vault/${input.folderId}`,
      contentType: input.contentType,
      bytes: input.bytes,
      resourceType: 'raw',
    }, {
      headers: input.idempotencyKey ? { 'x-idempotency-key': input.idempotencyKey } : undefined,
    })
  },
  registerDocument(input, idempotencyKey) {
    return apiClient.post<CloudRecord>('/ai-vault/documents', input, {
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : undefined,
    })
  },
  uploadToCloudinary: defaultCloudinaryUpload,
}

export async function uploadVaultFile(
  input: UploadVaultFileInput,
  dependencies: VaultUploadDependencies = defaultVaultUploadDependencies,
) {
  const folderId = input.folderId.trim()
  if (!folderId) throw new Error('Create or choose a folder before uploading.')

  const contentType = validateVaultUploadFile(input.file)
  const uploadAttemptKey = stableHash(`${folderId}:${input.file.name}:${input.file.size}:${contentType}`)
  const signature = await dependencies.createSignature({
    bytes: input.file.size,
    contentType,
    folderId,
    idempotencyKey: uploadAttemptKey,
  })
  const uploaded = await dependencies.uploadToCloudinary(signature, input.file)
  const bytes = Number.isFinite(uploaded.bytes) && uploaded.bytes > 0 ? uploaded.bytes : input.file.size
  const publicId = uploaded.public_id || `${signature.folder}/${signature.publicId}`.replace(/\/+/g, '/')
  const resourceType = (uploaded.resource_type || signature.resourceType) as UploadSignatureResponse['resourceType']
  const contentHash = stableHash([
    folderId,
    input.file.name,
    bytes,
    contentType,
    publicId,
    uploaded.etag ?? '',
  ].join(':'))

  const documentPayload = {
    title: input.file.name,
    sourceType: 'upload',
    cloudinaryPublicId: publicId,
    cloudinaryResourceType: resourceType,
    originalFilename: input.file.name,
    contentType,
    bytes,
    contentHash,
    tags: [`folder:${folderId}`],
  }

  try {
    return await dependencies.registerDocument(documentPayload, contentHash)
  } catch (error) {
    throw new VaultUploadRegistrationError(error instanceof Error ? error.message : 'AI Vault metadata registration failed.', {
      attemptedAt: new Date().toISOString(),
      documentPayload,
      folderId,
      uploadedAsset: {
        bytes,
        cloudinaryPublicId: publicId,
        cloudinaryResourceType: resourceType,
        contentType,
        originalFilename: input.file.name,
        secureUrl: uploaded.secure_url ?? null,
      },
    })
  }
}
