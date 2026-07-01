import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisMock = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  getCachedJson: vi.fn(async (key: string) => redisMock.cache.get(key) ?? null),
  setCachedJson: vi.fn(async (key: string, value: unknown) => {
    redisMock.cache.set(key, value)
  }),
}))

vi.mock('./redisService.js', () => ({
  cacheHash: (input: string) => `hash_${Buffer.from(input).toString('hex')}`,
  getCachedJson: redisMock.getCachedJson,
  setCachedJson: redisMock.setCachedJson,
}))

async function loadOpenRouterService() {
  vi.resetModules()
  return import('./openRouterService.js')
}

function clearOpenRouterEnv() {
  delete process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_CACHE_SECONDS
  delete process.env.OPENROUTER_FAIL_CLOSED
  delete process.env.OPENROUTER_MODEL
  delete process.env.OPENROUTER_MODEL_FALLBACKS
  delete process.env.OPENROUTER_MODELS
  delete process.env.OPENROUTER_TIMEOUT_MS
  delete process.env.WEB_ORIGIN
}

function input(userId = 'user_a') {
  return {
    message: 'Give me one AstraOS planning tip.',
    mode: 'Brief',
    userId,
  }
}

function openRouterResponse(content = 'Provider answer.') {
  return new Response(JSON.stringify({
    model: 'openrouter/free',
    choices: [{ message: { content } }],
    usage: { total_tokens: 10 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('openRouter service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    redisMock.cache.clear()
    clearOpenRouterEnv()
  })

  it('falls back locally on provider HTTP failures without caching fallback responses', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider down', { status: 500 })))
    const { generateAssistantReply } = await loadOpenRouterService()

    const reply = await generateAssistantReply({ ...input(), message: 'How should AI Vault work?' })

    expect(reply).toMatchObject({ cache: 'bypass', model: 'local', provider: 'local-fallback' })
    expect(reply.content).toContain('AI Vault')
    expect(redisMock.setCachedJson).not.toHaveBeenCalled()
  })

  it('falls back locally on network errors without caching fallback responses', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    const { generateAssistantReply } = await loadOpenRouterService()

    const reply = await generateAssistantReply(input())

    expect(reply.provider).toBe('local-fallback')
    expect(reply.cache).toBe('bypass')
    expect(redisMock.setCachedJson).not.toHaveBeenCalled()
  })

  it('fails closed when configured and the provider returns an error', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_FAIL_CLOSED = 'true'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider down', { status: 503 })))
    const { generateAssistantReply } = await loadOpenRouterService()

    await expect(generateAssistantReply(input())).rejects.toMatchObject({
      code: 'AI_PROVIDER_FAILED',
      status: 503,
    })
  })

  it('falls back on timeout unless fail-closed is enabled', async () => {
    vi.useFakeTimers()
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_TIMEOUT_MS = '1000'
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        Object.defineProperty(error, 'name', { value: 'AbortError' })
        reject(error)
      })
    })))
    const { generateAssistantReply } = await loadOpenRouterService()

    const pending = generateAssistantReply(input())
    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toMatchObject({
      provider: 'local-fallback',
      cache: 'bypass',
    })
  })

  it('throws timeout errors when fail-closed is enabled', async () => {
    vi.useFakeTimers()
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_FAIL_CLOSED = 'true'
    process.env.OPENROUTER_TIMEOUT_MS = '1000'
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        Object.defineProperty(error, 'name', { value: 'AbortError' })
        reject(error)
      })
    })))
    const { generateAssistantReply } = await loadOpenRouterService()

    const pending = expect(generateAssistantReply(input())).rejects.toMatchObject({
      code: 'AI_PROVIDER_TIMEOUT',
      status: 504,
    })
    await vi.advanceTimersByTimeAsync(1000)
    await pending
  })

  it('bypasses cache when OPENROUTER_CACHE_SECONDS is zero', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_CACHE_SECONDS = '0'
    const fetchMock = vi.fn(async () => openRouterResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { generateAssistantReply } = await loadOpenRouterService()

    const first = await generateAssistantReply(input())
    const second = await generateAssistantReply(input())

    expect(first).toMatchObject({ cache: 'bypass', provider: 'openrouter' })
    expect(second).toMatchObject({ cache: 'bypass', provider: 'openrouter' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(redisMock.setCachedJson).not.toHaveBeenCalled()
  })

  it('isolates cache keys by user id', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openRouterResponse('Reply A'))
      .mockResolvedValueOnce(openRouterResponse('Reply B'))
    vi.stubGlobal('fetch', fetchMock)
    const { generateAssistantReply } = await loadOpenRouterService()

    const userAFirst = await generateAssistantReply(input('user_a'))
    const userBFirst = await generateAssistantReply(input('user_b'))
    const userASecond = await generateAssistantReply(input('user_a'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(userAFirst).toMatchObject({ cache: 'miss', content: 'Reply A' })
    expect(userBFirst).toMatchObject({ cache: 'miss', content: 'Reply B' })
    expect(userASecond).toMatchObject({ cache: 'hit', content: 'Reply A', latencyMs: 0 })
    expect(redisMock.setCachedJson.mock.calls[0]?.[0]).not.toContain('user_a')
    expect(redisMock.setCachedJson.mock.calls[1]?.[0]).not.toContain('user_b')
    expect(redisMock.setCachedJson.mock.calls[0]?.[0]).not.toBe(redisMock.setCachedJson.mock.calls[1]?.[0])
  })

  it('sends ordered model fallbacks through the OpenRouter models array', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_MODEL = 'openrouter/free'
    process.env.OPENROUTER_MODEL_FALLBACKS = 'meta-llama/llama-free,openrouter/free,mistral/free'
    let capturedBody: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return openRouterResponse()
    }))
    const { generateAssistantReply } = await loadOpenRouterService()

    await generateAssistantReply({
      ...input(),
      conversationId: 'conversation_1',
    })

    expect(capturedBody?.models).toEqual([
      'openrouter/free',
      'meta-llama/llama-free',
      'mistral/free',
    ])
    expect(capturedBody?.session_id).not.toBe('conversation_1')
    expect(capturedBody?.user).not.toBe('user_a')
    expect(String(capturedBody?.session_id)).toMatch(/^hash_/)
    expect(String(capturedBody?.user)).toMatch(/^hash_/)
    expect(capturedBody).not.toHaveProperty('model')
  })
})
