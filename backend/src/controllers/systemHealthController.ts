import type { RequestHandler } from 'express'
import { cloudinaryHealth } from '../services/cloudinaryService.js'
import { mongoHealth } from '../services/database.js'
import { redisHealth } from '../services/redisService.js'
import { configured, env } from '../utils/env.js'
import { ok } from '../utils/http.js'

interface ProviderHealth {
  configured: boolean
  connected: boolean
  healthy: boolean
  latencyMs?: number
  error?: string
}

interface JobHealth {
  configured: boolean
  enabled: boolean
  healthy: boolean
  reason?: string
  status: 'disabled' | 'ready'
}

function toProviderHealth(result: { configured: boolean; connected: boolean; latencyMs?: number; error?: string }): ProviderHealth {
  return {
    configured: result.configured,
    connected: result.connected,
    healthy: result.configured ? result.connected : false,
    ...(typeof result.latencyMs === 'number' ? { latencyMs: result.latencyMs } : {}),
    ...(result.error ? { error: result.error } : {}),
  }
}

function notConfigured(): ProviderHealth {
  return { configured: false, connected: false, healthy: false }
}

function reminderJobHealth(): JobHealth {
  return {
    configured: false,
    enabled: false,
    healthy: false,
    reason: 'delivery-provider-not-configured',
    status: 'disabled',
  }
}

async function fetchHealth(url: string, headers: Record<string, string>): Promise<ProviderHealth> {
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    return {
      configured: true,
      connected: response.status < 500,
      healthy: response.ok,
      latencyMs: Date.now() - started,
      ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
    }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      healthy: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Provider health check failed.',
    }
  } finally {
    clearTimeout(timeout)
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

async function openRouterHealth(): Promise<ProviderHealth> {
  const apiKey = env('OPENROUTER_API_KEY')
  if (!apiKey) return notConfigured()
  return fetchHealth('https://openrouter.ai/api/v1/models', {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  })
}

async function clerkHealth(): Promise<ProviderHealth> {
  const secretKey = env('CLERK_SECRET_KEY')
  if (!secretKey) return notConfigured()
  return fetchHealth('https://api.clerk.com/v1/users?limit=1', {
    Authorization: `Bearer ${secretKey}`,
    Accept: 'application/json',
  })
}

export const systemHealthController: RequestHandler = async (_req, res, next) => {
  try {
    const [mongo, redis, cloudinary, openRouter, clerk] = await Promise.all([
      timed(mongoHealth),
      timed(redisHealth),
      timed(cloudinaryHealth),
      openRouterHealth(),
      clerkHealth(),
    ])

    const providers = {
      mongo: toProviderHealth(mongo),
      redis,
      cloudinary,
      openRouter,
      clerk,
    }
    const jobs = {
      reminders: reminderJobHealth(),
    }
    const configuredProviders = Object.values(providers).filter((provider) => provider.configured)
    const unhealthyConfigured = configuredProviders.filter((provider) => !provider.healthy)
    const configuredJobs = Object.values(jobs).filter((job) => job.configured)
    const unhealthyConfiguredJobs = configuredJobs.filter((job) => !job.healthy)

    return ok(res, {
      service: 'astraos-api',
      status: unhealthyConfigured.length || unhealthyConfiguredJobs.length ? 'degraded' : 'ok',
      time: new Date().toISOString(),
      providers,
      jobs,
      summary: {
        configured: configuredProviders.length,
        healthy: configuredProviders.length - unhealthyConfigured.length,
        jobs: {
          configured: configuredJobs.length,
          disabled: Object.values(jobs).filter((job) => job.status === 'disabled').length,
          healthy: configuredJobs.length - unhealthyConfiguredJobs.length,
        },
        requiredConfigured: {
          clerk: configured('CLERK_SECRET_KEY') && configured('CLERK_PUBLISHABLE_KEY'),
          mongo: configured('MONGODB_URI'),
          cloudinary: configured('CLOUDINARY_CLOUD_NAME') && configured('CLOUDINARY_API_KEY') && configured('CLOUDINARY_API_SECRET'),
          upstashRedis: configured('UPSTASH_REDIS_REST_URL') && configured('UPSTASH_REDIS_REST_TOKEN'),
          openRouter: configured('OPENROUTER_API_KEY'),
        },
      },
    })
  } catch (error) {
    return next(error)
  }
}
