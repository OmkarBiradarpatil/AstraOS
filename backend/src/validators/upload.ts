import { z } from 'zod'

const allowedContentTypes = [
  /^application\/pdf$/i,
  /^application\/json$/i,
  /^application\/msword$/i,
  /^application\/vnd\.openxmlformats-officedocument\./i,
  /^text\/(plain|markdown|csv|tab-separated-values)$/i,
  /^image\/(png|jpe?g|webp|gif)$/i,
]

export function isAllowedUploadContentType(value: string) {
  return allowedContentTypes.some((pattern) => pattern.test(value))
}

export const uploadSignatureSchema = z.object({
  folder: z.string().trim().min(1).max(120).regex(/^ai-vault(\/[a-zA-Z0-9_-]+)?$/),
  contentType: z.string().trim().min(3).max(160).refine(
    isAllowedUploadContentType,
    'Unsupported file type.',
  ),
  bytes: z.coerce.number().int().min(1).max(10 * 1024 * 1024),
  resourceType: z.literal('raw').default('raw'),
}).strict()

export type UploadSignatureInput = z.infer<typeof uploadSignatureSchema>
