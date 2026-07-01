import { isMongoId } from './cloudRecords'

interface Identified {
  id: string
}

interface MergeOptions {
  pruneMissingRemoteIds?: boolean
}

export function mergeRemoteWithLocal<T extends Identified>(remote: T[], local: T[], options: MergeOptions = {}) {
  const remoteIds = new Set(remote.map((item) => item.id))
  const localOnly = local.filter((item) => (
    !remoteIds.has(item.id) &&
    (!options.pruneMissingRemoteIds || !isMongoId(item.id))
  ))
  return [...remote, ...localOnly]
}

export function restoreDeletedItem<T extends Identified>(deleted: T, current: T[]) {
  if (current.some((item) => item.id === deleted.id)) return current
  return [deleted, ...current]
}
