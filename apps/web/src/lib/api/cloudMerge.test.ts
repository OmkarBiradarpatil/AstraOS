import { describe, expect, it } from 'vitest'
import { mergeRemoteWithLocal, restoreDeletedItem } from './cloudMerge'

describe('cloud merge utilities', () => {
  it('keeps remote records first while preserving local-only temporary records', () => {
    const merged = mergeRemoteWithLocal(
      [
        { id: '507f1f77bcf86cd799439011', title: 'Remote' },
      ],
      [
        { id: 'local_task_1', title: 'Local draft' },
        { id: '507f1f77bcf86cd799439011', title: 'Old remote copy' },
        { id: '507f1f77bcf86cd799439012', title: 'Stale remote-only local copy' },
      ],
    )

    expect(merged).toEqual([
      { id: '507f1f77bcf86cd799439011', title: 'Remote' },
      { id: 'local_task_1', title: 'Local draft' },
      { id: '507f1f77bcf86cd799439012', title: 'Stale remote-only local copy' },
    ])
  })

  it('can intentionally prune missing remote ids only for authoritative snapshots', () => {
    const merged = mergeRemoteWithLocal(
      [{ id: '507f1f77bcf86cd799439011', title: 'Remote' }],
      [
        { id: 'local_task_1', title: 'Local draft' },
        { id: '507f1f77bcf86cd799439012', title: 'Missing remote id' },
      ],
      { pruneMissingRemoteIds: true },
    )

    expect(merged).toEqual([
      { id: '507f1f77bcf86cd799439011', title: 'Remote' },
      { id: 'local_task_1', title: 'Local draft' },
    ])
  })

  it('does not duplicate a restored item when another local change re-added it', () => {
    const restored = restoreDeletedItem(
      { id: 'local_1', title: 'Deleted' },
      [{ id: 'local_1', title: 'Already restored' }],
    )

    expect(restored).toEqual([{ id: 'local_1', title: 'Already restored' }])
  })
})
