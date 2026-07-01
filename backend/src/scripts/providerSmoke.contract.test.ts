import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildSmokeReport,
  captureJobDiagnostics,
  captureProviderDiagnostics,
  formatSmokeInfoLines,
  resetSmokeDiagnostics,
  summarize,
} from './providerSmoke.js'

describe('provider smoke report contract', () => {
  beforeEach(() => {
    resetSmokeDiagnostics()
  })

  it('summarizes smoke results without hiding warnings or skips', () => {
    expect(summarize([
      { name: 'target', status: 'PASS' },
      { name: 'ready', status: 'WARN' },
      { name: 'auth-mode', status: 'SKIP' },
    ])).toMatchObject({
      fail: 0,
      ok: true,
      pass: 1,
      skip: 1,
      total: 3,
      warn: 1,
    })
  })

  it('emits schema v2 artifacts with provider and reminder job diagnostics', () => {
    captureProviderDiagnostics('ready', {
      openRouter: {
        configured: true,
        connected: true,
        healthy: true,
        latencyMs: 42,
        required: true,
      },
      reminders: {
        configured: false,
        healthy: false,
        reason: 'delivery-provider-not-configured',
        required: false,
        status: 'disabled',
      },
    })
    captureProviderDiagnostics('systemHealth', {
      upstashRedis: {
        configured: true,
        connected: false,
        error: 'HTTP 503',
        healthy: false,
        latencyMs: 15,
      },
    })
    captureJobDiagnostics('ready', {
      reminders: {
        configured: false,
        enabled: false,
        healthy: false,
        reason: 'delivery-provider-not-configured',
        status: 'disabled',
      },
    })
    captureJobDiagnostics('systemHealth', {
      reminders: {
        configured: false,
        enabled: false,
        healthy: false,
        reason: 'delivery-provider-not-configured',
        status: 'disabled',
      },
    })

    const report = buildSmokeReport([
      { name: 'target', status: 'PASS', detail: 'staging https://api.example/api' },
      { name: 'ready', status: 'WARN', detail: 'status=not-ready blockers=clerk' },
    ], Date.now() - 25)

    expect(report).toMatchObject({
      schemaVersion: 2,
      summary: {
        fail: 0,
        ok: true,
        pass: 1,
        total: 2,
        warn: 1,
      },
    })
    expect(report.providerDetails.openrouter.ready).toMatchObject({
      configured: true,
      healthy: true,
      latencyMs: 42,
      required: true,
    })
    expect(report.providerDetails.redis.systemHealth).toMatchObject({
      configured: true,
      error: 'HTTP 503',
      healthy: false,
      latencyMs: 15,
    })
    expect(report.providerDetails.reminders.ready).toMatchObject({
      reason: 'delivery-provider-not-configured',
      required: false,
      status: 'disabled',
    })
    expect(report.jobDetails.reminders.ready).toMatchObject({
      enabled: false,
      reason: 'delivery-provider-not-configured',
      status: 'disabled',
    })
  })

  it('prints compact release-gate info lines for human smoke runs', () => {
    captureProviderDiagnostics('ready', {
      mongo: {
        configured: false,
        connected: false,
        healthy: false,
        latencyMs: 0,
        required: true,
      },
    })
    captureJobDiagnostics('ready', {
      reminders: {
        configured: false,
        enabled: false,
        healthy: false,
        reason: 'delivery-provider-not-configured',
        status: 'disabled',
      },
    })

    const lines = formatSmokeInfoLines([
      { name: 'target', status: 'PASS' },
      { name: 'ready', status: 'WARN' },
      { name: 'auth-mode', status: 'SKIP' },
    ])

    expect(lines).toContain('INFO summary - pass=1 warn=1 skip=1 fail=0')
    expect(lines).toContain('INFO strict-flags - none')
    expect(lines.some((line) => line.includes('mongo=ready:missing,required,0ms'))).toBe(true)
    expect(lines.some((line) => line.includes('reminders=ready:disabled:delivery-provider-not-configured'))).toBe(true)
  })
})
