import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/api/apiClient'
import { useVaultData } from './useVaultData'

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    canUseProtectedApi: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}))

const emptyVaultPage = {
  documents: [],
  page: { hasMore: false, limit: 200, nextCursor: null },
}

function mockedClient() {
  return {
    canUseProtectedApi: vi.mocked(apiClient.canUseProtectedApi),
    get: vi.mocked(apiClient.get),
    post: vi.mocked(apiClient.post),
  }
}

describe('useVaultData cloud sync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockedClient().canUseProtectedApi.mockReturnValue(true)
    mockedClient().get.mockResolvedValue(emptyVaultPage)
  })

  it('sends an idempotency key when creating direct upload signatures', async () => {
    mockedClient().post.mockResolvedValueOnce({
      apiKey: 'cloud-key',
      cloudName: 'astra-cloud',
      folder: 'astraos/user/ai-vault/default',
      publicId: 'vault-123',
      resourceType: 'raw',
      signature: 'signed',
      timestamp: 1,
    })

    const { result } = renderHook(() => useVaultData())
    await waitFor(() => expect(mockedClient().get).toHaveBeenCalled())

    await act(async () => {
      await result.current.createUploadSignature({
        folderId: 'default',
        name: 'notes.pdf',
        size: 1200,
        type: 'application/pdf',
      })
    })

    const signatureCall = mockedClient().post.mock.calls[0]
    expect(signatureCall?.[0]).toBe('/uploads/signature')
    expect(signatureCall?.[1]).toMatchObject({
      bytes: 1200,
      contentType: 'application/pdf',
      folder: 'ai-vault/default',
      resourceType: 'raw',
    })
    expect(signatureCall?.[2]?.headers?.['x-idempotency-key']).toMatch(/^vault_[a-f0-9]+$/)
  })
})
