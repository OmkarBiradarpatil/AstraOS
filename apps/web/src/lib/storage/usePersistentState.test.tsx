import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPersistentStateError, usePersistentState } from './usePersistentState'

describe('usePersistentState', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('quarantines corrupt JSON instead of overwriting it in place', () => {
    localStorage.setItem('astraos.tasks', '{not-json')

    const { result } = renderHook(() => usePersistentState('astraos.tasks', [] as unknown[]))

    expect(result.current[0]).toEqual([])
    expect(localStorage.getItem('astraos.tasks')).toBe(JSON.stringify([]))
    const quarantineKeys = Object.keys(localStorage).filter((key) => key.startsWith('astraos.tasks.corrupt.'))
    expect(quarantineKeys).toHaveLength(1)
    expect(localStorage.getItem(quarantineKeys[0])).toBe('{not-json')
    expect(getPersistentStateError('astraos.tasks')).toBeNull()
  })

  it('does not remove legitimate user records that look like old QA fixtures', () => {
    const value = [{ id: 'assistant_welcome', title: 'Codex QA personal checklist' }]
    localStorage.setItem('astraos.tasks', JSON.stringify(value))

    const { result } = renderHook(() => usePersistentState('astraos.tasks', []))

    expect(result.current[0]).toEqual(value)
  })

  it('records localStorage write failures without throwing away in-memory state', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    const { result } = renderHook(() => usePersistentState('astraos.tasks', [] as Array<{ title: string }>))

    act(() => {
      result.current[1]([{ title: 'Keep me in memory' }])
    })

    expect(result.current[0]).toEqual([{ title: 'Keep me in memory' }])
    expect(setItem).toHaveBeenCalled()
    expect(getPersistentStateError('astraos.tasks')).toContain('Quota exceeded')
  })
})
