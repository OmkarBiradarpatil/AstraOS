export const legacyKeyPrefixes = ['ao3_', 'ao3_health_', 'ao3_ent_', 'ao_ayntk_', 'astraos.'] as const
const excludedKeys = new Set([
  'astraos.session',
])

export interface LegacyStorageSnapshot {
  key: string
  value: unknown
  byteLength: number
}

export function readLegacyStorage(): LegacyStorageSnapshot[] {
  if (typeof window === 'undefined') return []

  return Object.keys(window.localStorage)
    .filter((key) => !excludedKeys.has(key) && (key === 'ao3_diary' || legacyKeyPrefixes.some((prefix) => key.startsWith(prefix))))
    .sort()
    .map((key) => {
      const raw = window.localStorage.getItem(key) ?? ''
      const value = parseLegacyValue(raw)

      return {
        key,
        value,
        byteLength: raw.length * 2,
      }
    })
}

export function getLegacyStorageSize(snapshot = readLegacyStorage()) {
  return snapshot.reduce((total, item) => total + item.byteLength, 0)
}

function parseLegacyValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
