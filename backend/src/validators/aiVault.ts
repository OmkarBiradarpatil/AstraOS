import { z } from 'zod'
import { isAllowedUploadContentType } from './upload.js'

const cloudinaryPublicIdPattern = /^[a-zA-Z0-9/._:-]{1,240}$/

function isSafeCloudinaryPublicId(value: string) {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  if (normalized.startsWith('/') || normalized.endsWith('/')) return false
  return normalized
    .split('/')
    .every((segment) => segment && segment !== '.' && segment !== '..') && cloudinaryPublicIdPattern.test(normalized)
}

export const aiVaultDocumentSchema = z.object({
  title: z.string().trim().min(1).max(240),
  sourceType: z.enum(['upload', 'note', 'url']),
  cloudinaryPublicId: z.string().trim().max(240).refine(isSafeCloudinaryPublicId, 'Invalid Cloudinary public id.').optional(),
  cloudinaryResourceType: z.enum(['image', 'video', 'raw', 'auto']).optional(),
  originalFilename: z.string().trim().max(240).optional(),
  contentType: z.string().trim().max(160).optional(),
  bytes: z.coerce.number().int().min(0).max(50 * 1024 * 1024).default(0),
  contentHash: z.string().trim().min(8).max(128),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
}).superRefine((value, context) => {
  if (value.sourceType !== 'upload') {
    if (value.cloudinaryPublicId) {
      context.addIssue({
        code: 'custom',
        message: 'Only uploaded documents can include a Cloudinary public id.',
        path: ['cloudinaryPublicId'],
      })
    }

    if (value.cloudinaryResourceType) {
      context.addIssue({
        code: 'custom',
        message: 'Only uploaded documents can include a Cloudinary resource type.',
        path: ['cloudinaryResourceType'],
      })
    }
    return
  }

  if (!value.cloudinaryPublicId) {
    context.addIssue({
      code: 'custom',
      message: 'Uploaded documents require a Cloudinary public id.',
      path: ['cloudinaryPublicId'],
    })
  }

  if (!value.cloudinaryResourceType) {
    context.addIssue({
      code: 'custom',
      message: 'Uploaded documents require a Cloudinary resource type.',
      path: ['cloudinaryResourceType'],
    })
  }

  if (!value.contentType) {
    context.addIssue({
      code: 'custom',
      message: 'Uploaded documents require a content type.',
      path: ['contentType'],
    })
  } else if (!isAllowedUploadContentType(value.contentType)) {
    context.addIssue({
      code: 'custom',
      message: 'Unsupported uploaded document content type.',
      path: ['contentType'],
    })
  }

  if (!value.originalFilename) {
    context.addIssue({
      code: 'custom',
      message: 'Uploaded documents require an original filename.',
      path: ['originalFilename'],
    })
  }

  if (value.bytes <= 0) {
    context.addIssue({
      code: 'custom',
      message: 'Uploaded documents require a positive byte size.',
      path: ['bytes'],
    })
  }
})

export const aiVaultIngestTextSchema = z.object({
  text: z.string().min(1).max(2_000_000),
})

export type AiVaultDocumentInput = z.infer<typeof aiVaultDocumentSchema>
export type AiVaultIngestTextInput = z.infer<typeof aiVaultIngestTextSchema>
