import { v2 as cloudinary } from 'cloudinary'
import { randomUUID } from 'node:crypto'
import { env } from '../utils/env.js'
import { ApiError } from '../utils/http.js'
import type { UploadSignatureInput } from '../validators/upload.js'

const CLOUDINARY_OWNER_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/
const CLOUDINARY_PUBLIC_ID_PATTERN = /^[a-zA-Z0-9/._:-]{1,240}$/

export function isCloudinaryConfigured() {
  return Boolean(env('CLOUDINARY_CLOUD_NAME') && env('CLOUDINARY_API_KEY') && env('CLOUDINARY_API_SECRET'))
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) {
    throw new ApiError(503, 'CLOUDINARY_NOT_CONFIGURED', 'Cloudinary is not configured.')
  }
  cloudinary.config({
    cloud_name: env('CLOUDINARY_CLOUD_NAME'),
    api_key: env('CLOUDINARY_API_KEY'),
    api_secret: env('CLOUDINARY_API_SECRET'),
    secure: true,
  })
}

function cloudinaryOwnerSegment(userId: string) {
  const owner = userId.trim()
  if (!CLOUDINARY_OWNER_PATTERN.test(owner)) {
    throw new ApiError(400, 'INVALID_OWNER_ID', 'Authenticated user id cannot be used as a storage owner segment.')
  }
  return owner
}

function normalizeCloudinaryPublicId(publicId: string) {
  const normalized = publicId.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  const segments = normalized.split('/')

  if (
    normalized.startsWith('/') ||
    normalized.endsWith('/') ||
    segments.some((segment) => segment === '.' || segment === '..') ||
    !CLOUDINARY_PUBLIC_ID_PATTERN.test(normalized)
  ) {
    throw new ApiError(400, 'INVALID_PUBLIC_ID', 'Cloudinary public id is not valid.')
  }

  return normalized
}

function userCloudinaryRoot(userId: string) {
  return `astraos/${cloudinaryOwnerSegment(userId)}`
}

export async function cloudinaryHealth() {
  if (!isCloudinaryConfigured()) return { configured: false, connected: false, healthy: false }
  try {
    configureCloudinary()
    await cloudinary.api.ping()
    return { configured: true, connected: true, healthy: true }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      healthy: false,
      error: error instanceof Error ? error.message : 'Cloudinary health check failed.',
    }
  }
}

export function createUploadSignature(input: UploadSignatureInput, userId: string) {
  configureCloudinary()
  const timestamp = Math.round(Date.now() / 1000)
  const owner = cloudinaryOwnerSegment(userId)
  const folder = `${userCloudinaryRoot(owner)}/${input.folder}`.replace(/\/+/g, '/')
  const publicId = `vault-${randomUUID()}`
  const params = {
    timestamp,
    folder,
    public_id: publicId,
    resource_type: input.resourceType,
    overwrite: 'false',
    unique_filename: 'false',
    context: `owner_id=${owner}|content_type=${input.contentType}|bytes=${input.bytes}`,
  }
  const signature = cloudinary.utils.api_sign_request(params, env('CLOUDINARY_API_SECRET')!)
  const uploadParams = {
    ...params,
    signature,
  }
  return {
    cloudName: env('CLOUDINARY_CLOUD_NAME'),
    apiKey: env('CLOUDINARY_API_KEY'),
    timestamp,
    folder,
    publicId,
    resourceType: input.resourceType,
    signature,
    uploadParams,
  }
}

export async function getUserCloudinaryAssetMetadata(userId: string, publicId: string, resourceType = 'raw') {
  configureCloudinary()
  const normalized = normalizeCloudinaryPublicId(publicId)
  const allowedPrefix = `${userCloudinaryRoot(userId)}/ai-vault/`
  if (!normalized.startsWith(allowedPrefix)) {
    throw new ApiError(403, 'FORBIDDEN_ASSET', 'Asset does not belong to the authenticated user.')
  }
  return cloudinary.api.resource(normalized, {
    resource_type: resourceType,
    context: true,
  })
}

export async function listUserCloudinaryAssets(userId: string, folder = 'ai-vault') {
  configureCloudinary()
  const safeFolder = folder.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!/^ai-vault(\/[a-zA-Z0-9_-]+)?$/.test(safeFolder)) {
    throw new ApiError(400, 'INVALID_STORAGE_FOLDER', 'Storage folder is not valid.')
  }
  const prefix = `${userCloudinaryRoot(userId)}/${safeFolder}`.replace(/\/+/g, '/')
  const result = await cloudinary.api.resources({
    type: 'upload',
    prefix,
    max_results: 100,
    resource_type: 'raw',
  })
  return result.resources ?? []
}

export async function deleteUserCloudinaryAsset(userId: string, publicId: string, resourceType = 'raw') {
  configureCloudinary()
  const normalized = normalizeCloudinaryPublicId(publicId)
  const allowedPrefix = `${userCloudinaryRoot(userId)}/ai-vault/`
  if (!normalized.startsWith(allowedPrefix)) {
    throw new ApiError(403, 'FORBIDDEN_ASSET', 'Asset does not belong to the authenticated user.')
  }
  return cloudinary.uploader.destroy(normalized, {
    resource_type: resourceType,
    invalidate: true,
  })
}
