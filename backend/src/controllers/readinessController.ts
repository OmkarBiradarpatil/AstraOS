import type { RequestHandler } from 'express'
import { cloudinaryHealth } from '../services/cloudinaryService.js'
import { mongoHealth } from '../services/database.js'
import { redisHealth } from '../services/redisService.js'
import { configured, env } from '../utils/env.js'
import { ok } from '../utils/http.js'

type ProviderName = 'clerk' | 'mongo' | 'cloudinary' | 'redis' | 'openrouter' | 'reminders'

interface ReadinessProvider {
  required: boolean
  configured: boolean
  connected: boolean
  healthy: boolean
  disabled?: boolean
  latencyMs?: number
  error?: string
  reason?: string
  status?: 'ready' | 'disabled'
}

function requiredProviders() {
  const defaultProviders = process.env.NODE_ENV === 'production'
    ? 'clerk,mongo,cloudinary,redis,openrouter'
    : 'clerk,mongo'
  const raw = env('ASTRAOS_REQUIRED_PROVIDERS') ?? defaultProviders
  return new Set(
    raw
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider): provider is ProviderName =>
        ['clerk', 'mongo', 'cloudinary', 'redis', 'openrouter', 'reminders'].includes(provider),
      ),
  )
}

function configuredProvider(name: ProviderName, required: Set<ProviderName>): ReadinessProvider {
  const configuredValue = name === 'clerk'
    ? configured('CLERK_SECRET_KEY') && configured('CLERK_PUBLISHABLE_KEY')
    : configured('OPENROUTER_API_KEY')
  return {
    required: required.has(name),
    configured: configuredValue,
    connected: configuredValue,
    healthy: configuredValue,
  }
}

function remindersProvider(required: Set<ProviderName>): ReadinessProvider {
  return {
    required: required.has('reminders'),
    configured: false,
    connected: false,
    healthy: false,
    disabled: true,
    reason: 'delivery-provider-not-configured',
    status: 'disabled',
  }
}

function reminderJobReadiness() {
  return {
    configured: false,
    enabled: false,
    healthy: false,
    reason: 'delivery-provider-not-configured',
    status: 'disabled' as const,
  }
}

function fromHealth(
  required: Set<ProviderName>,
  name: ProviderName,
  result: { configured: boolean; connected: boolean; healthy?: boolean; latencyMs?: number; error?: string },
): ReadinessProvider {
  const healthy = result.healthy ?? (result.configured && result.connected)
  return {
    required: required.has(name),
    configured: result.configured,
    connected: result.connected,
    healthy,
    ...(typeof result.latencyMs === 'number' ? { latencyMs: result.latencyMs } : {}),
    ...(result.error ? { error: result.error } : {}),
  }
}

async function timed<T extends { configured: boolean; connected: boolean; healthy?: boolean; error?: string }>(
  check: () => Promise<T>,
): Promise<T & { latencyMs: number }> {
  const started = Date.now()
  const result = await check()
  return {
    ...result,
    latencyMs: Date.now() - started,
  }
}

export const readinessController: RequestHandler = async (_req, res, next) => {
  try {
    const required = requiredProviders()
    const [mongo, redis, cloudinary] = await Promise.all([
      timed(mongoHealth),
      timed(redisHealth),
      timed(cloudinaryHealth),
    ])

    const providers: Record<ProviderName, ReadinessProvider> = {
      clerk: configuredProvider('clerk', required),
      mongo: fromHealth(required, 'mongo', mongo),
      cloudinary: fromHealth(required, 'cloudinary', cloudinary),
      redis: fromHealth(required, 'redis', redis),
      openrouter: configuredProvider('openrouter', required),
      reminders: remindersProvider(required),
    }

    const blockers = Object.entries(providers)
      .filter(([, provider]) => provider.required && !provider.healthy)
      .map(([name]) => name)

    return ok(res, {
      service: 'astraos-api',
      status: blockers.length ? 'not-ready' : 'ready',
      time: new Date().toISOString(),
      blockers,
      jobs: {
        reminders: reminderJobReadiness(),
      },
      providers,
    }, blockers.length ? 503 : 200)
  } catch (error) {
    return next(error)
  }
}
