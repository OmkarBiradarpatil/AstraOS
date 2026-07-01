export const ASTRA_STORAGE_PREFIXES = ['ao3_', 'ao3_health_', 'ao3_ent_', 'ao_ayntk_', 'astraos.'] as const
const ASTRA_STORAGE_EXCLUDED_KEYS = new Set([
  'astraos.session',
])

export interface AstraStorageEntry {
  raw: string
  value: unknown
}

export interface AstraLocalSnapshot {
  exportedAt: string
  version: 1
  entryCount: number
  byteSize: number
  entries: Record<string, AstraStorageEntry>
}

export function isAstraStorageKey(key: string) {
  return !ASTRA_STORAGE_EXCLUDED_KEYS.has(key) && ASTRA_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function parseStoredValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function estimateUtf8Bytes(value: string) {
  if (typeof Blob !== 'undefined') return new Blob([value]).size
  return value.length * 2
}

export function readAstraLocalSnapshot(storage: Storage = window.localStorage): AstraLocalSnapshot {
  const entries: Record<string, AstraStorageEntry> = {}
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key || !isAstraStorageKey(key)) continue
    const raw = storage.getItem(key) ?? ''
    entries[key] = { raw, value: parseStoredValue(raw) }
  }

  const byteSize = estimateUtf8Bytes(JSON.stringify(entries))
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    entryCount: Object.keys(entries).length,
    byteSize,
    entries,
  }
}

export function snapshotToPayload(snapshot: AstraLocalSnapshot) {
  return Object.fromEntries(Object.entries(snapshot.entries).map(([key, entry]) => [key, entry.value]))
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function createSnapshotId(snapshot: AstraLocalSnapshot) {
  const source = stableStringify(snapshotToPayload(snapshot))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `astraos-${snapshot.entryCount}-${(hash >>> 0).toString(16)}`
}

export function downloadAstraSnapshot(snapshot: AstraLocalSnapshot, documentRef: Document = document) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }))
  const anchor = documentRef.createElement('a')
  anchor.href = url
  anchor.download = `astraos-backup-${snapshot.exportedAt.slice(0, 10)}.json`
  documentRef.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
