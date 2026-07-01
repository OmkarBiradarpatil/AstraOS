export const astraRoles = ['student', 'parent', 'teacher', 'admin'] as const

export type AstraRole = (typeof astraRoles)[number]

export interface ApiSuccess<T> {
  ok: true
  data: T
  requestId: string
}

export interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export interface OwnedEntity {
  id: string
  ownerId: string
  orgId?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export interface AiVaultDocument extends OwnedEntity {
  title: string
  sourceType: 'upload' | 'note' | 'url'
  status: 'queued' | 'processing' | 'ready' | 'failed'
  tags: string[]
  summary: string
}
