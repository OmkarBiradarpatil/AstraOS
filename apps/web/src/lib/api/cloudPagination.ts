import { apiClient } from './apiClient'
import type { CloudDocumentListResponse, CloudListResponse, CloudRecord } from './cloudRecords'

interface PaginationOptions {
  limit?: number
  maxPages?: number
  signal?: AbortSignal
}

function pagedPath(path: string, cursor: string | undefined, limit: number) {
  const [basePath, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return `${basePath}?${params.toString()}`
}

function pageLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 200
  return Math.min(Math.max(Math.round(limit ?? 200), 1), 200)
}

export async function getAllCloudItems(path: string, options: PaginationOptions = {}) {
  const items: CloudRecord[] = []
  const limit = pageLimit(options.limit)
  const maxPages = Math.max(1, Math.min(Math.round(options.maxPages ?? 50), 50))
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page += 1) {
    const response = await apiClient.get<CloudListResponse<CloudRecord>>(pagedPath(path, cursor, limit), {
      signal: options.signal,
    })
    items.push(...response.items)
    if (!response.page?.hasMore) return items
    if (!response.page.nextCursor) throw new Error(`Cloud pagination for ${path} did not return a next cursor.`)
    cursor = response.page.nextCursor
  }

  throw new Error(`Cloud pagination for ${path} exceeded the safety limit.`)
}

export async function getAllCloudDocuments(path: string, options: PaginationOptions = {}) {
  const documents: CloudRecord[] = []
  const limit = pageLimit(options.limit)
  const maxPages = Math.max(1, Math.min(Math.round(options.maxPages ?? 50), 50))
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page += 1) {
    const response = await apiClient.get<CloudDocumentListResponse<CloudRecord>>(pagedPath(path, cursor, limit), {
      signal: options.signal,
    })
    documents.push(...response.documents)
    if (!response.page?.hasMore) return documents
    if (!response.page.nextCursor) throw new Error(`Cloud pagination for ${path} did not return a next cursor.`)
    cursor = response.page.nextCursor
  }

  throw new Error(`Cloud pagination for ${path} exceeded the safety limit.`)
}
