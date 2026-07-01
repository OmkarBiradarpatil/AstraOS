import { describe, expect, it } from 'vitest'
import { createSnapshotId, isAstraStorageKey, readAstraLocalSnapshot, snapshotToPayload } from './storage'

describe('AstraOS legacy storage', () => {
  it('recognizes AstraOS-owned localStorage keys', () => {
    expect(isAstraStorageKey('ao3_deadlines')).toBe(true)
    expect(isAstraStorageKey('ao3_health_water')).toBe(true)
    expect(isAstraStorageKey('ao_ayntk_history')).toBe(true)
    expect(isAstraStorageKey('astraos.tasks')).toBe(true)
    expect(isAstraStorageKey('astraos.focus.sessions')).toBe(true)
    expect(isAstraStorageKey('astraos.assistant.messages')).toBe(true)
    expect(isAstraStorageKey('astraos.session')).toBe(false)
    expect(isAstraStorageKey('unrelated')).toBe(false)
  })

  it('exports only AstraOS keys with parsed values', () => {
    localStorage.clear()
    localStorage.setItem('ao3_deadlines', JSON.stringify([{ title: 'Ship' }]))
    localStorage.setItem('astraos.tasks', JSON.stringify([{ title: 'Build' }]))
    localStorage.setItem('astraos.session', JSON.stringify({ email: 'private@example.com' }))
    localStorage.setItem('other', 'nope')

    const snapshot = readAstraLocalSnapshot(localStorage)

    expect(snapshot.entryCount).toBe(2)
    expect(snapshotToPayload(snapshot)).toEqual({
      ao3_deadlines: [{ title: 'Ship' }],
      'astraos.tasks': [{ title: 'Build' }],
    })
    expect(createSnapshotId(snapshot)).toMatch(/^astraos-2-/)
  })
})
