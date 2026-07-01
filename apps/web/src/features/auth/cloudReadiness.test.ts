import { describe, expect, it } from 'vitest'
import { getCloudReadiness } from './cloudReadiness'

describe('cloud readiness status', () => {
  it('reports local device storage when the API is not configured', () => {
    expect(getCloudReadiness({
      apiConfigured: false,
      authSource: 'local',
      hasUser: true,
      protectedApiReady: false,
    })).toMatchObject({
      detail: 'device storage',
      label: 'Local',
      ready: false,
      tone: 'violet',
    })
  })

  it('reports auth required when the API exists without protected API readiness', () => {
    expect(getCloudReadiness({
      apiConfigured: true,
      authSource: 'local',
      hasUser: true,
      protectedApiReady: false,
    })).toMatchObject({
      detail: 'auth required',
      label: 'Local',
      ready: false,
      tone: 'amber',
    })
  })

  it('reports cloud ready for an authenticated Clerk session with an API base URL', () => {
    expect(getCloudReadiness({
      apiConfigured: true,
      authSource: 'clerk',
      hasUser: true,
      protectedApiReady: false,
    })).toMatchObject({
      detail: 'protected sync ready',
      label: 'Cloud',
      ready: true,
      tone: 'green',
    })
  })
})
