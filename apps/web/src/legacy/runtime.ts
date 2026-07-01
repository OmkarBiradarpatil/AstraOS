import { getBackendStatus, createDeadlineReminder, exportCloudData, getAstraBackendConfig, stageLegacyLocalData } from './backend'
import { canHydrateLegacyStorageFromCloud, hydrateLegacyStorageFromCloud } from './cloudBridge'
import { collectDomDiagnostics } from './diagnostics'
import { ASTRAOS_PAGE_REGISTRY } from './pageRegistry'
import { createSnapshotId, downloadAstraSnapshot, readAstraLocalSnapshot, snapshotToPayload } from './storage'
import { extractYouTubeId, getYouTubeEmbedUrl } from './youtube'

export const ASTRAOS_RUNTIME_VERSION = '2026.06.07-legacy-bridge'

export function createAstraOSRuntime(documentRef: Document = document, storage: Storage = window.localStorage) {
  return {
    version: ASTRAOS_RUNTIME_VERSION,
    pages: ASTRAOS_PAGE_REGISTRY,
    youtube: {
      extractYouTubeId,
      getYouTubeEmbedUrl,
    },
    storage: {
      createSnapshot: () => readAstraLocalSnapshot(storage),
      createSnapshotId,
      toPayload: snapshotToPayload,
      downloadBackup: () => downloadAstraSnapshot(readAstraLocalSnapshot(storage), documentRef),
      stageCloudImport: () => stageLegacyLocalData(storage),
      exportCloudData,
    },
    backend: {
      config: getAstraBackendConfig,
      isConfigured: () => getAstraBackendConfig().configured,
      status: getBackendStatus,
      createDeadlineReminder,
    },
    cloud: {
      canHydrateLegacyStorage: canHydrateLegacyStorageFromCloud,
      hydrateLegacyStorage: () => hydrateLegacyStorageFromCloud(storage),
    },
    diagnostics: () => collectDomDiagnostics(documentRef, storage),
  }
}

export type AstraOSRuntime = ReturnType<typeof createAstraOSRuntime>
