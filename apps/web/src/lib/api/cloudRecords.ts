export interface CloudListResponse<T> {
  items: T[]
  page?: CloudPage
  cache?: 'hit' | 'miss' | 'bypass'
}

export interface CloudDocumentListResponse<T> {
  documents: T[]
  page?: CloudPage
}

export interface CloudPage {
  limit: number
  hasMore: boolean
  nextCursor: string | null
}

export type CloudRecord = Record<string, unknown>

export function cloudRecordId(record: CloudRecord, fallback: string) {
  const id = record._id ?? record.id
  return typeof id === 'string' && id ? id : fallback
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function asNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : []
}

export function asPlainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function isoString(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string' || !value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

export function dateOnly(value: unknown, fallback = '') {
  if (!value) return fallback
  const iso = isoString(value, '')
  return iso ? iso.slice(0, 10) : fallback
}

export function isMongoId(id: string) {
  return /^[a-f\d]{24}$/i.test(id)
}
