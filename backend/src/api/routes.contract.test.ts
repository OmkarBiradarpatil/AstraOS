import { describe, expect, it, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('AstraOS API route contracts', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env.NODE_ENV = 'test'
    delete process.env.ASTRAOS_ALLOW_DEV_AUTH
    delete process.env.ASTRAOS_JSON_LIMIT
    delete process.env.ASTRAOS_OPS_TOKEN
    delete process.env.ASTRAOS_REQUIRED_PROVIDERS
    delete process.env.ASTRAOS_TRUST_PROXY
    delete process.env.CLERK_SECRET_KEY
    delete process.env.CLERK_PUBLISHABLE_KEY
    delete process.env.CLOUDINARY_API_KEY
    delete process.env.CLOUDINARY_API_SECRET
    delete process.env.CLOUDINARY_CLOUD_NAME
    delete process.env.MONGODB_URI
    delete process.env.OPENROUTER_API_KEY
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.WEB_ORIGIN
  })

  it('returns the API 404 envelope for unknown API routes', async () => {
    const response = await request(createApp()).get('/api/not-a-real-route')

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'API route was not found.',
      },
    })
    expect(response.body.requestId).toBeTruthy()
  })

  it('returns the global 404 envelope outside the API router', async () => {
    const response = await request(createApp()).get('/not-a-real-route')

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route was not found.',
      },
    })
    expect(response.body.requestId).toBeTruthy()
  })

  it('requires auth before validating protected write bodies', async () => {
    const response = await request(createApp())
      .post('/api/tasks')
      .send({})

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('AUTH_NOT_CONFIGURED')
  })

  it('returns unsupported media type for non-JSON API write requests', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .post('/api/tasks')
      .set('x-astra-dev-user', 'media_user')
      .set('Content-Type', 'text/plain')
      .send('title=Bad')

    expect(response.status).toBe(415)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
  })

  it.each([
    ['GET', '/api/tasks'],
    ['GET', '/api/settings'],
    ['GET', '/api/ai-vault/documents'],
    ['POST', '/api/uploads/signature'],
    ['POST', '/api/assistant/messages'],
  ])('requires auth for %s %s before controller work', async (method, path) => {
    const agent = request(createApp())
    const response = method === 'GET'
      ? await agent.get(path)
      : await agent.post(path).send({})

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('AUTH_NOT_CONFIGURED')
  })

  it.each([
    ['/api/bookmarks', { title: 'Docs', url: 'not-a-url' }],
    ['/api/deadlines', { title: 'Exam', dueDate: 'not-a-date' }],
    ['/api/health-logs', { type: 'invalid', date: '2026-06-08' }],
    ['/api/entertainment-data', { type: 'invalid' }],
  ])('rejects invalid create payloads for %s before Mongo work', async (path, body) => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .post(path)
      .set('x-astra-dev-user', 'schema_user')
      .send(body)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it.each([
    '/api/tasks?limit=abc',
    '/api/tasks?limit=0',
    '/api/tasks?limit=201',
    '/api/ai-vault/documents?limit=1.5',
  ])('rejects invalid list limits for %s before provider work', async (path) => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .get(path)
      .set('x-astra-dev-user', 'limit_user')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_LIMIT')
  })

  it.each([
    ['/api/bookmarks', { title: 'Docs', url: 'https://example.com' }],
    ['/api/deadlines', { title: 'Exam', dueDate: '2026-06-09' }],
    ['/api/health-logs', { type: 'water', date: '2026-06-08' }],
    ['/api/entertainment-data', { type: 'anime' }],
  ])('accepts valid create payloads for %s and then stops at missing Mongo', async (path, body) => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .post(path)
      .set('x-astra-dev-user', 'schema_user')
      .send(body)

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('DATABASE_NOT_CONFIGURED')
  })

  it.each([
    ['PATCH', '/api/tasks/not-an-id', { status: 'done' }],
    ['DELETE', '/api/bookmarks/not-an-id', undefined],
    ['DELETE', '/api/ai-vault/documents/not-an-id', undefined],
    ['POST', '/api/ai-vault/documents/not-an-id/chunks', { text: 'valid text' }],
  ])('validates Mongo id params for %s %s before service work', async (method, path, body) => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const agent = request(createApp())
    const response = method === 'PATCH'
      ? await agent.patch(path).set('x-astra-dev-user', 'param_user').send(body)
      : method === 'POST'
        ? await agent.post(path).set('x-astra-dev-user', 'param_user').send(body)
        : await agent.delete(path).set('x-astra-dev-user', 'param_user')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects caller-controlled settings ownership fields', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .patch('/api/settings')
      .set('x-astra-dev-user', 'settings_user')
      .send({ ownerId: 'attacker', theme: 'dark' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('fails upload signature requests honestly when Cloudinary is not configured', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'cloud_missing_user')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('CLOUDINARY_NOT_CONFIGURED')
  })

  it('replays successful create-style requests with matching idempotency keys', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-test-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-test-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-test-secret'
    const app = createApp()
    const body = {
      folder: 'ai-vault/default',
      contentType: 'application/pdf',
      bytes: 1000,
      resourceType: 'raw',
    }

    const first = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'idempo_user')
      .set('x-idempotency-key', 'upload-key-123')
      .send(body)
    const second = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'idempo_user')
      .set('x-idempotency-key', 'upload-key-123')
      .send(body)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(first.headers['x-idempotency-status']).toBe('stored')
    expect(second.headers['x-idempotency-replayed']).toBe('true')
    expect(second.headers['x-idempotency-status']).toBe('hit')
    expect(second.body.data.publicId).toBe(first.body.data.publicId)
    expect(second.body.requestId).not.toBe(first.body.requestId)
  })

  it('rejects idempotency key reuse with a different body', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-test-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-test-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-test-secret'
    const app = createApp()

    await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'idempo_conflict_user')
      .set('x-idempotency-key', 'upload-key-456')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })
    const conflict = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'idempo_conflict_user')
      .set('x-idempotency-key', 'upload-key-456')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 2000,
        resourceType: 'raw',
      })

    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT')
  })

  it('rejects unsafe idempotency keys before controller work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-test-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-test-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-test-secret'
    const response = await request(createApp())
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'idempo_bad_user')
      .set('x-idempotency-key', '../bad')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY')
  })

  it('fails AI Vault asset listing honestly when Cloudinary is not configured', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .get('/api/ai-vault/storage/assets')
      .set('x-astra-dev-user', 'cloud_missing_user')

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('CLOUDINARY_NOT_CONFIGURED')
  })

  it('rejects empty AI Vault chunk ingestion before Mongo work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .post('/api/ai-vault/documents/507f1f77bcf86cd799439011/chunks')
      .set('x-astra-dev-user', 'vault_chunk_user')
      .send({ text: '' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('accepts valid AI Vault chunk text and then stops at missing Mongo', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const response = await request(createApp())
      .post('/api/ai-vault/documents/507f1f77bcf86cd799439011/chunks')
      .set('x-astra-dev-user', 'vault_chunk_user')
      .send({ text: 'This is valid extracted text for chunk ingestion.' })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('DATABASE_NOT_CONFIGURED')
  })

  it('returns ready when all configured required providers are locally provable', async () => {
    process.env.ASTRAOS_REQUIRED_PROVIDERS = 'clerk,openrouter'
    process.env.CLERK_SECRET_KEY = 'test-clerk-secret'
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_ready'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    const response = await request(createApp()).get('/api/ready')

    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('ready')
    expect(response.body.data.blockers).toEqual([])
    expect(response.body.data.providers.clerk).toMatchObject({ required: true, healthy: true })
    expect(response.body.data.providers.openrouter).toMatchObject({ required: true, healthy: true })
    expect(response.body.data.providers.mongo.required).toBe(false)
    expect(response.body.data.providers.reminders).toMatchObject({
      disabled: true,
      required: false,
      status: 'disabled',
    })
  })

  it('blocks readiness when reminder delivery is explicitly required but disabled', async () => {
    process.env.ASTRAOS_REQUIRED_PROVIDERS = 'reminders'
    const response = await request(createApp()).get('/api/ready')

    expect(response.status).toBe(503)
    expect(response.body.data.status).toBe('not-ready')
    expect(response.body.data.blockers).toEqual(['reminders'])
    expect(response.body.data.providers.reminders).toMatchObject({
      configured: false,
      disabled: true,
      healthy: false,
      reason: 'delivery-provider-not-configured',
      required: true,
      status: 'disabled',
    })
    expect(response.body.data.jobs.reminders).toMatchObject({
      enabled: false,
      reason: 'delivery-provider-not-configured',
      status: 'disabled',
    })
  })

  it('accepts bearer ops tokens for detailed system health', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    process.env.ASTRAOS_OPS_TOKEN = 'ops-secret-token-with-32-characters'
    const response = await request(createApp())
      .get('/api/system/health')
      .set('Authorization', 'Bearer ops-secret-token-with-32-characters')

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.service).toBe('astraos-api')
  })

  it.each([
    [{ message: '' }],
    [{ message: 'Hello', history: [{ role: 'system', content: 'bad' }] }],
    [{ message: 'Hello', history: Array.from({ length: 13 }, () => ({ role: 'user', content: 'too much' })) }],
    [{ message: 'Hello', conversationId: 'x'.repeat(121) }],
  ])('rejects invalid assistant payloads before provider calls', async (body) => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await request(createApp())
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'assistant_validation_user')
      .send(body)

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows configured production CORS preflight requests', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    const response = await request(createApp())
      .options('/api/tasks')
      .set('Origin', 'https://astraos.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,x-idempotency-key,x-request-id')

    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('https://astraos.example')
    expect(response.headers['access-control-allow-methods']).toContain('POST')
    expect(response.headers['access-control-allow-headers']).toContain('authorization')
    expect(response.headers['access-control-allow-headers']).toContain('x-idempotency-key')
    expect(response.headers['access-control-max-age']).toBe('600')
  })

  it('exposes idempotency response headers to browser clients', async () => {
    process.env.WEB_ORIGIN = 'https://astraos.example'
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-test-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-test-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-test-secret'
    const response = await request(createApp())
      .post('/api/uploads/signature')
      .set('Origin', 'https://astraos.example')
      .set('x-astra-dev-user', 'browser_idempo_user')
      .set('x-idempotency-key', 'browser-upload-key-123')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(200)
    expect(response.headers['x-idempotency-status']).toBe('stored')
    expect(response.headers['access-control-allow-origin']).toBe('https://astraos.example')
    expect(response.headers['access-control-expose-headers']).toContain('x-idempotency-status')
    expect(response.headers['access-control-expose-headers']).toContain('x-idempotency-replayed')
  })

  it('denies unconfigured production CORS preflight origins', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    const response = await request(createApp())
      .options('/api/tasks')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('CORS_ORIGIN_DENIED')
  })
})
