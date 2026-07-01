import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/api/apiClient'
import { useTasks } from './useTasks'

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    canUseProtectedApi: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}))

const emptyTaskPage = {
  items: [],
  page: { hasMore: false, limit: 200, nextCursor: null },
}

function mockedClient() {
  return {
    canUseProtectedApi: vi.mocked(apiClient.canUseProtectedApi),
    delete: vi.mocked(apiClient.delete),
    get: vi.mocked(apiClient.get),
    patch: vi.mocked(apiClient.patch),
    post: vi.mocked(apiClient.post),
  }
}

describe('useTasks cloud sync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockedClient().canUseProtectedApi.mockReturnValue(true)
    mockedClient().get.mockResolvedValue(emptyTaskPage)
  })

  it('sends an idempotency key and reconciles successful creates to the cloud id', async () => {
    const remoteId = '507f1f77bcf86cd799439011'
    mockedClient().post.mockResolvedValueOnce({
      _id: remoteId,
      title: 'Ship release gate',
      notes: 'Keep it boring and safe.',
      status: 'todo',
      priority: 'high',
      tags: ['release'],
      estimateMinutes: 45,
      dueDate: null,
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
    })

    const { result } = renderHook(() => useTasks())
    await waitFor(() => expect(mockedClient().get).toHaveBeenCalled())

    await act(async () => {
      await result.current.addTask({
        title: 'Ship release gate',
        notes: 'Keep it boring and safe.',
        priority: 'high',
        estimateMinutes: 45,
        tags: 'release',
      })
    })

    const createCall = mockedClient().post.mock.calls[0]
    expect(createCall?.[0]).toBe('/tasks')
    expect(createCall?.[1]).toMatchObject({
      estimateMinutes: 45,
      priority: 'high',
      tags: ['release'],
      title: 'Ship release gate',
    })
    expect(createCall?.[2]?.headers?.['x-idempotency-key']).toMatch(/^task_/)
    expect(result.current.tasks[0]).toMatchObject({
      id: remoteId,
      priority: 'high',
      title: 'Ship release gate',
    })
  })

  it('rolls back only the optimistic task when a cloud create fails', async () => {
    localStorage.setItem('astraos.tasks', JSON.stringify([{
      id: 'task_existing',
      title: 'Existing local work',
      notes: '',
      status: 'todo',
      priority: 'medium',
      tags: [],
      estimateMinutes: 25,
      dueDate: '',
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
    }]))
    mockedClient().post.mockRejectedValueOnce(new Error('Cloud create failed.'))

    const { result } = renderHook(() => useTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))

    await act(async () => {
      await result.current.addTask({ title: 'Do not keep failed optimistic task' })
    })

    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0]?.title).toBe('Existing local work')
    expect(result.current.error).toBe('Cloud create failed.')
  })

  it('restores a deleted Mongo-backed task if cloud delete fails', async () => {
    const remoteTask = {
      id: '507f1f77bcf86cd799439011',
      title: 'Restore on delete failure',
      notes: '',
      status: 'todo',
      priority: 'medium',
      tags: [],
      estimateMinutes: 25,
      dueDate: '',
      createdAt: '2026-06-09T00:00:00.000Z',
      updatedAt: '2026-06-09T00:00:00.000Z',
    }
    localStorage.setItem('astraos.tasks', JSON.stringify([remoteTask]))
    mockedClient().delete.mockRejectedValueOnce(new Error('Cloud delete failed.'))

    const { result } = renderHook(() => useTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))

    await act(async () => {
      await result.current.removeTask(remoteTask.id)
    })

    expect(mockedClient().delete).toHaveBeenCalledWith(`/tasks/${remoteTask.id}`)
    expect(result.current.tasks).toEqual([remoteTask])
    expect(result.current.error).toBe('Cloud delete failed.')
  })
})
