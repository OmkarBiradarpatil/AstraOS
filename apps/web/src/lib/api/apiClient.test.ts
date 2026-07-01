import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiClient, setApiTokenProvider } from './apiClient'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': 'server-request-id',
      ...init.headers,
    },
  })
}

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    setApiTokenProvider(null)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('attaches Clerk bearer tokens and request ids', async () => {
    setApiTokenProvider(async () => 'test-token')
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { items: [] } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.get<{ items: unknown[] }>('/tasks', { retries: 0 })

    expect(result.items).toEqual([])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/tasks',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer test-token',
          'x-request-id': expect.any(String),
        }),
      }),
    )
  })

  it('retries retryable responses using Retry-After guidance', async () => {
    setApiTokenProvider(async () => 'test-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down.' } }, {
        status: 429,
        headers: { 'Retry-After': '0' },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { status: 'recovered' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.get<{ status: string }>('/assistant/messages', { retries: 1 })

    expect(result.status).toBe('recovered')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry mutating requests by default', async () => {
    setApiTokenProvider(async () => 'test-token')
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: false,
      error: { code: 'TEMPORARY', message: 'Temporary failure.' },
    }, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.post('/tasks', { title: 'No duplicate writes' })).rejects.toMatchObject({
      code: 'TEMPORARY',
      status: 503,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes non-json API failures with response request ids', async () => {
    setApiTokenProvider(async () => 'test-token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', {
      status: 502,
      headers: { 'x-request-id': 'edge-request-id' },
    })))

    await expect(apiClient.get('/health', { authRequired: false, retries: 0 })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      requestId: 'edge-request-id',
      status: 502,
    })
  })

  it('turns aborts into timeout errors', async () => {
    setApiTokenProvider(async () => 'test-token')
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })))

    const requestPromise = apiClient.get('/slow', { retries: 0, timeoutMs: 5 }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5)

    const error = await requestPromise
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({
      code: 'REQUEST_TIMEOUT',
      status: 0,
    })
  })

  it('does not wait unbounded Retry-After delays', async () => {
    setApiTokenProvider(async () => 'test-token')
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down.' } }, {
        status: 429,
        headers: { 'Retry-After': '3600' },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { status: 'recovered' } }))
    vi.stubGlobal('fetch', fetchMock)

    const requestPromise = apiClient.get<{ status: string }>('/tasks', { retries: 1 })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(requestPromise).resolves.toEqual({ status: 'recovered' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('logs retry diagnostics with redacted paths and no request body or auth token', async () => {
    setApiTokenProvider(async () => 'secret-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: 'TEMPORARY', message: 'Try again.' } }, {
        status: 503,
        headers: { 'Retry-After': '0' },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { status: 'ok' } }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.post('/tasks?token=secret-query', { title: 'Secret body value' }, {
      headers: { 'x-idempotency-key': 'task_idempo_123' },
      retries: 1,
    })

    expect(console.info).toHaveBeenCalledWith('[AstraOS API]', expect.objectContaining({
      event: 'retry',
      path: '/tasks?<redacted>',
      status: 503,
    }))
    const logs = vi.mocked(console.info).mock.calls.map((call) => JSON.stringify(call)).join('\n')
    expect(logs).not.toContain('secret-token')
    expect(logs).not.toContain('secret-query')
    expect(logs).not.toContain('Secret body value')
  })

  it('honors caller abort signals without retrying', async () => {
    setApiTokenProvider(async () => 'test-token')
    const controller = new AbortController()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const requestPromise = apiClient.get('/slow', {
      retries: 2,
      signal: controller.signal,
      timeoutMs: 10_000,
    }).catch((error: unknown) => error)
    controller.abort()

    const error = await requestPromise
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({
      code: 'REQUEST_ABORTED',
      status: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails fast when no API base URL is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    await expect(apiClient.get('/tasks')).rejects.toMatchObject({
      code: 'API_NOT_CONFIGURED',
      status: 0,
    })
  })

  it('fails protected requests before fetch when no auth token is available', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.get('/tasks')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REQUIRED',
      status: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows public requests to opt out of auth tokens', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { status: 'ok' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.get('/health', { authRequired: false, retries: 0 })).resolves.toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    )
  })

  it('does not allow caller headers to override auth or request safety headers', async () => {
    setApiTokenProvider(async () => 'safe-token')
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { saved: true } }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.post('/tasks', { title: 'Safe headers' }, {
      headers: {
        Authorization: 'Bearer attacker',
        'Content-Type': 'text/plain',
        'x-request-id': 'attacker-request-id',
        'x-extra': 'allowed',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/tasks',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer safe-token',
          'Content-Type': 'application/json',
          'x-extra': 'allowed',
          'x-request-id': expect.not.stringMatching(/^attacker-request-id$/),
        }),
      }),
    )
  })

  it('rejects unserializable request bodies before fetch', async () => {
    setApiTokenProvider(async () => 'test-token')
    const body: Record<string, unknown> = { title: 'Circular' }
    body.self = body
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.post('/tasks', body)).rejects.toMatchObject({
      code: 'INVALID_REQUEST_BODY',
      status: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('times out hanging auth token reads', async () => {
    vi.useFakeTimers()
    setApiTokenProvider(async () => new Promise(() => undefined))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const requestPromise = apiClient.get('/tasks', { timeoutMs: 5 }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(5)

    const error = await requestPromise
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({
      code: 'REQUEST_TIMEOUT',
      status: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
