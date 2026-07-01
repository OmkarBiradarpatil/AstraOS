import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateLegacyStorageFromCloud } from './cloudBridge'
import { apiClient } from '../lib/api/apiClient'

vi.mock('../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    isConfigured: vi.fn(() => true),
  },
}))

function listResponse(items: unknown[], nextCursor: string | null = null) {
  return {
    items,
    page: {
      hasMore: Boolean(nextCursor),
      limit: 200,
      nextCursor,
    },
  }
}

function documentResponse(documents: unknown[], nextCursor: string | null = null) {
  return {
    documents,
    page: {
      hasMore: Boolean(nextCursor),
      limit: 200,
      nextCursor,
    },
  }
}

describe('legacy cloud hydration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    window.Clerk = { session: { getToken: vi.fn() } }
  })

  it('hydrates all paginated cloud records before writing legacy storage', async () => {
    const getMock = vi.mocked(apiClient.get)
    getMock.mockImplementation(async (path: string) => {
      if (path === '/deadlines?limit=200') {
        return listResponse([
          { _id: '507f1f77bcf86cd799439011', title: 'Page one', dueDate: '2026-06-08', dueTime: '09:00' },
        ], '2026-06-08T10:00:00.000Z|507f1f77bcf86cd799439011')
      }
      if (path.startsWith('/deadlines?limit=200&cursor=')) {
        return listResponse([
          { _id: '507f1f77bcf86cd799439012', title: 'Page two', dueDate: '2026-06-09', dueTime: '10:00' },
        ])
      }
      if (path.startsWith('/ai-vault/documents')) return documentResponse([])
      if (path === '/settings') return { settings: null }
      return listResponse([])
    })

    const result = await hydrateLegacyStorageFromCloud(localStorage)
    const deadlines = JSON.parse(localStorage.getItem('ao3_deadlines') ?? '[]') as Array<{ title: string }>

    expect(result.synced).toBe(true)
    expect(deadlines.map((deadline) => deadline.title)).toEqual(['Page one', 'Page two'])
    expect(getMock).toHaveBeenCalledWith('/deadlines?limit=200', { signal: undefined })
    expect(getMock).toHaveBeenCalledWith(
      '/deadlines?limit=200&cursor=2026-06-08T10%3A00%3A00.000Z%7C507f1f77bcf86cd799439011',
      { signal: undefined },
    )
  })

  it('reports a hydration error when a paginated response omits its next cursor', async () => {
    const getMock = vi.mocked(apiClient.get)
    getMock.mockImplementation(async (path: string) => {
      if (path === '/bookmarks?limit=200') {
        return {
          items: [{ title: 'Broken cursor', url: 'https://example.com' }],
          page: { hasMore: true, limit: 200, nextCursor: null },
        }
      }
      if (path.startsWith('/ai-vault/documents')) return documentResponse([])
      if (path === '/settings') return { settings: null }
      return listResponse([])
    })

    const result = await hydrateLegacyStorageFromCloud(localStorage)

    expect(result.errors).toContain('Cloud pagination for /bookmarks did not return a next cursor.')
    expect(localStorage.getItem('ao3_bookmarks')).toBeNull()
  })
})
