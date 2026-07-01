import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const renderYaml = readFileSync(resolve(process.cwd(), '../render.yaml'), 'utf8')

describe('Render deployment blueprint contract', () => {
  it('uses readiness health checks for the API service', () => {
    expect(renderYaml).toContain('name: astraos-api')
    expect(renderYaml).toContain('rootDir: backend')
    expect(renderYaml).toContain('healthCheckPath: /api/ready')
  })

  it.each([
    'NODE_ENV',
    'ASTRAOS_ALLOW_DEV_AUTH',
    'ASTRAOS_JSON_LIMIT',
    'ASTRAOS_REQUIRED_PROVIDERS',
    'ASTRAOS_OPS_TOKEN',
    'ASTRAOS_TRUST_PROXY',
    'WEB_ORIGIN',
    'CLERK_SECRET_KEY',
    'CLERK_PUBLISHABLE_KEY',
    'MONGODB_URI',
    'MONGODB_MAX_POOL_SIZE',
    'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
    'MONGODB_SOCKET_TIMEOUT_MS',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'OPENROUTER_API_KEY',
    'OPENROUTER_MODEL',
    'OPENROUTER_MODEL_FALLBACKS',
    'OPENROUTER_MODELS',
    'OPENROUTER_TIMEOUT_MS',
    'OPENROUTER_CACHE_SECONDS',
    'OPENROUTER_FAIL_CLOSED',
  ])('declares required production env key %s', (key) => {
    expect(renderYaml).toContain(`key: ${key}`)
  })
})
