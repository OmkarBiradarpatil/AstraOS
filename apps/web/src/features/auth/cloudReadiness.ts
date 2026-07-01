import { apiClient } from '../../lib/api/apiClient'
import { useAuth } from './useAuth'

export interface CloudReadinessInput {
  apiConfigured: boolean
  authSource: 'clerk' | 'local'
  hasUser: boolean
  protectedApiReady: boolean
}

export function getCloudReadiness(input: CloudReadinessInput) {
  const ready = input.apiConfigured && input.hasUser && (input.protectedApiReady || input.authSource === 'clerk')
  const apiOnly = input.apiConfigured && !ready

  return {
    apiConfigured: input.apiConfigured,
    ready,
    label: ready ? 'Cloud' : 'Local',
    detail: ready
      ? 'protected sync ready'
      : apiOnly
        ? 'auth required'
        : 'device storage',
    tone: ready ? 'green' as const : apiOnly ? 'amber' as const : 'violet' as const,
  }
}

export function useCloudReadiness() {
  const { source, user } = useAuth()
  return getCloudReadiness({
    apiConfigured: apiClient.isConfigured(),
    authSource: source,
    hasUser: Boolean(user),
    protectedApiReady: apiClient.canUseProtectedApi(),
  })
}
