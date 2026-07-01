import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('AstraOS API', () => {
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
    delete process.env.OPENROUTER_CACHE_SECONDS
    delete process.env.OPENROUTER_FAIL_CLOSED
    delete process.env.OPENROUTER_MODEL
    delete process.env.OPENROUTER_MODEL_FALLBACKS
    delete process.env.OPENROUTER_MODELS
    delete process.env.OPENROUTER_TIMEOUT_MS
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.WEB_ORIGIN
  })

  it('returns provider readiness from health', async () => {
    const app = createApp()
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.service).toBe('astraos-api')
    expect(response.body.requestId).toBeTruthy()
  })

  it('sets production security headers and constrained CORS responses', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    const app = createApp()
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://astraos.example')

    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('https://astraos.example')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['content-security-policy']).toContain("default-src 'none'")
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('rejects disallowed production CORS origins', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    const app = createApp()
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example')

    expect(response.status).toBe(403)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('CORS_ORIGIN_DENIED')
  })

  it('sanitizes unsafe caller-provided request ids', async () => {
    const app = createApp()
    const response = await request(app)
      .get('/api/health')
      .set('x-request-id', 'unsafe request id')

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toBeTruthy()
    expect(response.headers['x-request-id']).not.toBe('unsafe request id')
  })

  it('returns clear client errors for malformed JSON', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'json_user')
      .set('Content-Type', 'application/json')
      .send('{"message":')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_JSON')
  })

  it('rejects oversized request bodies before route work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.ASTRAOS_JSON_LIMIT = '16b'
    const app = createApp()
    const response = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'payload_user')
      .send({ message: 'This payload is intentionally too large.' })

    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('returns rate-limit headers and retry guidance', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const userId = `rate_limit_${Date.now()}`
    let response: request.Response | undefined

    for (let index = 0; index < 31; index += 1) {
      response = await request(app)
        .post('/api/assistant/messages')
        .set('x-astra-dev-user', userId)
        .send({ message: 'Give me one short planning tip.' })
    }

    expect(response?.status).toBe(429)
    expect(response?.headers['ratelimit-limit']).toBe('30')
    expect(response?.headers['ratelimit-remaining']).toBe('0')
    expect(response?.headers['retry-after']).toBeTruthy()
    expect(response?.body.error.code).toBe('RATE_LIMITED')
  })

  it('returns a free daily India quiz without requiring auth', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const target = String(url)
      const categoryItems = target.includes('Bollywood')
        ? ['Bollywood box office race heats up - Film Test', 'Major OTT release trends in India - Stream Test', 'Actor interview sparks industry debate - Cinema Test', 'Hindi film trailer breaks records - Trailer Test']
        : target.includes('Parliament')
          ? ['Parliament debate dominates political agenda - Policy Test', 'Election Commission issues new update - Poll Test', 'Supreme Court hearing draws attention - Law Test', 'State election strategy shifts - Politics Test']
          : target.includes('technology')
            ? ['AI startup funding rises in India - Tech Test', 'Cybersecurity warning issued for users - Security Test', 'Semiconductor policy gets fresh push - Chip Test', 'Indian SaaS company launches AI product - Startup Test']
            : target.includes('cricket')
              ? ['India cricket squad update announced - Sports Test', 'IPL transfer buzz grows before auction - Cricket Test', 'Olympic medal hopeful wins event - Games Test', 'Football league final draws crowd - Sport Desk']
              : target.includes('economy')
                ? ['RBI policy signal moves markets - Business Test', 'Stock market volatility returns - Market Test', 'UPI transaction milestone reported - Fintech Test', 'EV market expansion accelerates - Auto Test']
                : target.includes('world news')
                  ? ['Global summit outcome affects India - World Test', 'Trade tension update watched by diplomats - Geo Test', 'International relations meeting concludes - Foreign Test', 'Diaspora headline gains attention - Global Desk']
                  : target.includes('ISRO')
                    ? ['ISRO mission update released - Space Test', 'Climate alert issued for Indian cities - Climate Test', 'Renewable energy project expands - Energy Test', 'Science research team reports breakthrough - Science Desk']
                    : target.includes('current affairs')
                      ? ['Education reform update announced - India Test', 'Digital governance rollout begins - Governance Test', 'Public transport policy reviewed - City Test', 'Weather alert issued for major cities - Weather Test']
                      : ['India startup funding rises - Business Test', 'Cricket final draws record audience - Sports Test', 'AI education tools expand in India - Tech Test', 'Weather alert issued for major cities - Weather Test']

      const body = target.includes('trending/rss')
        ? `<?xml version="1.0"?><rss><channel>
            <item><title>UPI payments</title><link>https://trends.google.com/trending/rss?geo=IN</link><pubDate>Mon, 08 Jun 2026 10:00:00 GMT</pubDate><ht:news_item_title>UPI sets a new transaction record</ht:news_item_title><ht:news_item_source>Test Daily</ht:news_item_source></item>
            <item><title>ISRO mission</title><link>https://trends.google.com/trending/rss?geo=IN</link><pubDate>Mon, 08 Jun 2026 10:00:00 GMT</pubDate><ht:news_item_title>ISRO prepares a new launch update</ht:news_item_title><ht:news_item_source>Space Desk</ht:news_item_source></item>
          </channel></rss>`
        : `<?xml version="1.0"?><rss><channel>${categoryItems.map((title) => `<item><title>${title}</title><link>https://news.google.com/rss</link><pubDate>Mon, 08 Jun 2026 10:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`

      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      })
    })

    const app = createApp()
    const response = await request(app).get('/api/quiz/daily')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.region).toBe('IN')
    expect(response.body.data.questions.length).toBeGreaterThan(5)
    expect(response.body.data.questions[0].options).toHaveLength(4)
    expect(response.body.data.source).toBe('live-rss')
    const categories = new Set(response.body.data.questions.map((question: { category: string }) => question.category))
    expect(categories.has('source')).toBe(false)
    expect(Array.from(categories)).toEqual(expect.arrayContaining(['bollywood', 'politics', 'tech', 'sports']))
  })

  it('returns not-ready when required providers are missing', async () => {
    const app = createApp()
    const response = await request(app).get('/api/ready')
    expect(response.status).toBe(503)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.status).toBe('not-ready')
    expect(response.body.data.blockers).toEqual(expect.arrayContaining(['clerk', 'mongo']))
    expect(response.body.data.providers.mongo.latencyMs).toEqual(expect.any(Number))
    expect(response.body.data.providers.redis.latencyMs).toEqual(expect.any(Number))
    expect(response.body.data.providers.cloudinary.latencyMs).toEqual(expect.any(Number))
    expect(response.body.data.providers.reminders).toMatchObject({
      configured: false,
      disabled: true,
      healthy: false,
      reason: 'delivery-provider-not-configured',
      required: false,
      status: 'disabled',
    })
    expect(response.body.data.jobs.reminders).toMatchObject({
      enabled: false,
      reason: 'delivery-provider-not-configured',
      status: 'disabled',
    })
  })

  it('returns provider readiness from system health', async () => {
    const app = createApp()
    const response = await request(app).get('/api/system/health')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.service).toBe('astraos-api')
    expect(response.body.data.providers.mongo).toMatchObject({
      configured: false,
      connected: false,
      healthy: false,
      latencyMs: expect.any(Number),
    })
    expect(response.body.data.jobs.reminders).toMatchObject({
      configured: false,
      enabled: false,
      healthy: false,
      reason: 'delivery-provider-not-configured',
      status: 'disabled',
    })
    expect(response.body.data.summary.jobs).toMatchObject({
      configured: 0,
      disabled: 1,
      healthy: 0,
    })
  })

  it('reports degraded system health with external provider timing', async () => {
    process.env.CLERK_SECRET_KEY = 'test-clerk-secret'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('openrouter')) {
        return new Response(JSON.stringify({ error: 'down' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await request(createApp()).get('/api/system/health')

    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('degraded')
    expect(response.body.data.providers.openRouter).toMatchObject({
      configured: true,
      connected: false,
      healthy: false,
      error: 'HTTP 503',
      latencyMs: expect.any(Number),
    })
    expect(response.body.data.providers.clerk).toMatchObject({
      configured: true,
      connected: true,
      healthy: true,
      latencyMs: expect.any(Number),
    })
  })

  it('requires an ops token for detailed system health in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    process.env.ASTRAOS_OPS_TOKEN = 'ops-secret-token-with-32-characters'
    const app = createApp()

    const denied = await request(app).get('/api/system/health')
    expect(denied.status).toBe(401)
    expect(denied.body.error.code).toBe('OPS_UNAUTHORIZED')

    const allowed = await request(app)
      .get('/api/system/health')
      .set('x-astra-ops-token', 'ops-secret-token-with-32-characters')
    expect(allowed.status).toBe(200)
    expect(allowed.body.ok).toBe(true)
  })

  it('rejects weak operations tokens in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    process.env.ASTRAOS_OPS_TOKEN = 'short-token'
    const response = await request(createApp())
      .get('/api/system/health')
      .set('x-astra-ops-token', 'short-token')

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('OPS_AUTH_WEAK')
  })

  it('refuses production startup when WEB_ORIGIN is missing', () => {
    process.env.NODE_ENV = 'production'
    expect(() => createApp()).toThrow('WEB_ORIGIN is required in production.')
  })

  it('uses dev auth fallback only when explicitly enabled', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'test_user')
      .send({ message: 'How should AstraOS protect AI Vault security?' })

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.provider).toBe('local-fallback')
    expect(response.body.data.reply).toContain('AI Vault')
  })

  it('routes assistant requests through the zero-cost OpenRouter model by default', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    let capturedBody: Record<string, unknown> | null = null

    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({
        model: 'openrouter/free',
        choices: [{ message: { content: 'Fast cloud reply.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const app = createApp()
    const response = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'ai_speed_user')
      .send({
        message: 'Give me one fast productivity tip.',
        mode: 'Brief',
        history: [{ role: 'user', content: 'Previous context' }],
      })

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.provider).toBe('openrouter')
    expect(response.body.data.model).toBe('openrouter/free')
    expect(response.body.data.reply).toBe('Fast cloud reply.')
    expect(capturedBody?.model).toBe('openrouter/free')
    expect(capturedBody?.max_tokens).toBe(700)
  })

  it('caches successful assistant replies for repeat prompts', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    process.env.OPENROUTER_CACHE_SECONDS = '60'
    const prompt = `Cache this planning answer ${Date.now()}`
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: 'openrouter/free',
      choices: [{ message: { content: 'Cached cloud reply.' } }],
      usage: { total_tokens: 8 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const app = createApp()
    const first = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'ai_cache_user')
      .send({ message: prompt })
    const second = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'ai_cache_user')
      .send({ message: prompt })

    expect(first.status).toBe(200)
    expect(first.body.data.cache).toBe('miss')
    expect(second.status).toBe(200)
    expect(second.body.data.cache).toBe('hit')
    expect(second.body.data.latencyMs).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back cleanly when OpenRouter returns invalid JSON', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    vi.stubGlobal('fetch', async () => new Response('not-json', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const app = createApp()
    const response = await request(app)
      .post('/api/assistant/messages')
      .set('x-astra-dev-user', 'ai_bad_json_user')
      .send({ message: 'security checklist' })

    expect(response.status).toBe(200)
    expect(response.body.data.provider).toBe('local-fallback')
    expect(response.body.data.cache).toBe('bypass')
    expect(response.body.data.reply).toContain('Security hardening')
  })

  it('rejects dev auth fallback in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.WEB_ORIGIN = 'https://astraos.example'
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .get('/api/users/me')
      .set('x-astra-dev-user', 'test_user')

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('AUTH_NOT_CONFIGURED')
  })

  it('exposes authenticated user context without requiring Mongo in local tests', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .get('/api/users/me')
      .set('x-astra-dev-user', 'test_user')
      .set('x-astra-dev-role', 'teacher')

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.data.auth.userId).toBe('test_user')
    expect(response.body.data.auth.role).toBe('teacher')
    expect(response.body.data.profile).toBeNull()
  })

  it('rejects client-side role updates on the profile endpoint', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .patch('/api/users/me')
      .set('x-astra-dev-user', 'test_user')
      .send({ role: 'admin' })

    expect(response.status).toBe(400)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects client-side email updates on the profile endpoint', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .patch('/api/users/me')
      .set('x-astra-dev-user', 'test_user')
      .send({ email: 'spoof@example.com' })

    expect(response.status).toBe(400)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('fails profile updates honestly when Mongo is not configured', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .patch('/api/users/me')
      .set('x-astra-dev-user', 'test_user')
      .send({ name: 'Astra User' })

    expect(response.status).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('DATABASE_NOT_CONFIGURED')
  })

  it('fails production data routes honestly when Mongo is not configured', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .get('/api/tasks')
      .set('x-astra-dev-user', 'test_user')

    expect(response.status).toBe(503)
    expect(response.body.ok).toBe(false)
    expect(response.body.error.code).toBe('DATABASE_NOT_CONFIGURED')
  })

  it('rejects invalid list cursors before touching Mongo', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .get('/api/tasks?cursor=not-a-date')
      .set('x-astra-dev-user', 'test_user')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_CURSOR')
  })

  it('rejects invalid AI Vault list cursors before touching Mongo', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .get('/api/ai-vault/documents?cursor=not-a-date')
      .set('x-astra-dev-user', 'test_user')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_CURSOR')
  })

  it('rejects empty PATCH payloads before touching Mongo', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .patch('/api/tasks/507f1f77bcf86cd799439011')
      .set('x-astra-dev-user', 'test_user')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('accepts partial PATCH payloads without create defaults', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .patch('/api/tasks/507f1f77bcf86cd799439011')
      .set('x-astra-dev-user', 'test_user')
      .send({ status: 'done' })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('DATABASE_NOT_CONFIGURED')
  })

  it('rejects caller-controlled Cloudinary public ids', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'test_user')
      .send({
        folder: 'ai-vault/default',
        publicId: 'attacker/chosen-id',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('creates isolated Cloudinary upload signatures', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-test-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-test-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-test-secret'
    const app = createApp()
    const response = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'cloud_user')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(200)
    expect(response.body.data.cloudName).toBe('astra-test-cloud')
    expect(response.body.data.apiKey).toBe('astra-test-key')
    expect(response.body.data.folder).toBe('astraos/cloud_user/ai-vault/default')
    expect(response.body.data.publicId).toMatch(/^vault-/)
    expect(response.body.data.signature).toBeTruthy()
    expect(response.body.data.uploadParams).toMatchObject({
      context: 'owner_id=cloud_user|content_type=application/pdf|bytes=1000',
      folder: 'astraos/cloud_user/ai-vault/default',
      overwrite: 'false',
      resource_type: 'raw',
      signature: response.body.data.signature,
      timestamp: response.body.data.timestamp,
      unique_filename: 'false',
    })
    expect(response.body.data.uploadParams.public_id).toBe(response.body.data.publicId)
  })

  it('rejects active image upload types such as SVG', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', 'cloud_user')
      .send({
        folder: 'ai-vault/default',
        contentType: 'image/svg+xml',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects unsafe authenticated owner ids before storage work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    process.env.CLOUDINARY_CLOUD_NAME = 'astra-test-cloud'
    process.env.CLOUDINARY_API_KEY = 'astra-test-key'
    process.env.CLOUDINARY_API_SECRET = 'astra-test-secret'
    const app = createApp()
    const response = await request(app)
      .post('/api/uploads/signature')
      .set('x-astra-dev-user', '../evil')
      .send({
        folder: 'ai-vault/default',
        contentType: 'application/pdf',
        bytes: 1000,
        resourceType: 'raw',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_AUTH_USER_ID')
  })

  it('rejects uploaded AI Vault documents without upload metadata before Mongo work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/ai-vault/documents')
      .set('x-astra-dev-user', 'vault_user')
      .send({
        title: 'Fake upload',
        sourceType: 'upload',
        contentHash: '12345678',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects Cloudinary asset fields on non-upload AI Vault documents before provider work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/ai-vault/documents')
      .set('x-astra-dev-user', 'vault_user')
      .send({
        title: 'Note with forbidden asset fields',
        sourceType: 'note',
        cloudinaryPublicId: 'astraos/vault_user/ai-vault/default/note',
        cloudinaryResourceType: 'raw',
        contentHash: '12345678',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects malformed AI Vault Cloudinary public ids before Mongo work', async () => {
    process.env.ASTRAOS_ALLOW_DEV_AUTH = 'true'
    const app = createApp()
    const response = await request(app)
      .post('/api/ai-vault/documents')
      .set('x-astra-dev-user', 'vault_user')
      .send({
        title: 'Bad public id',
        sourceType: 'upload',
        cloudinaryPublicId: 'astraos/vault_user/ai-vault/../bad',
        cloudinaryResourceType: 'raw',
        originalFilename: 'bad.pdf',
        contentType: 'application/pdf',
        bytes: 1000,
        contentHash: '12345678',
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
  })
})
