import { createAstraOSRuntime, type AstraOSRuntime } from './runtime'

declare global {
  interface Window {
    AstraOSRuntime?: AstraOSRuntime
    __astraosRuntimeBooted?: boolean
    ft_extractVideoId?: (input: string) => string | null
  }
}

function bootAstraOSRuntime() {
  if (window.__astraosRuntimeBooted) return
  window.__astraosRuntimeBooted = true

  const runtime = createAstraOSRuntime()
  window.AstraOSRuntime = runtime
  window.ft_extractVideoId = runtime.youtube.extractYouTubeId
  document.documentElement.dataset.astraosRuntime = runtime.version

  window.dispatchEvent(
    new CustomEvent('astraos:runtime-ready', {
      detail: {
        version: runtime.version,
        pages: runtime.pages.length,
        backendConfigured: runtime.backend.isConfigured(),
      },
    }),
  )

  if (runtime.cloud.canHydrateLegacyStorage()) {
    void runtime.cloud.hydrateLegacyStorage()
      .then((result) => {
        window.dispatchEvent(new CustomEvent('astraos:cloud-hydrated', { detail: result }))
      })
      .catch((error: unknown) => {
        window.dispatchEvent(new CustomEvent('astraos:cloud-hydration-error', { detail: error }))
      })
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAstraOSRuntime, { once: true })
} else {
  bootAstraOSRuntime()
}
