type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  requestId?: string
}

interface ApiRequestOptions {
  authRequired?: boolean
  method?: HttpMethod
  body?: unknown
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  signal?: AbortSignal
}

interface ClerkSessionLike {
  getToken?: () => Promise<string | null>
}

interface ClerkGlobalLike {
  session?: ClerkSessionLike | null
}

declare global {
  interface Window {
    Clerk?: ClerkGlobalLike
  }
}

export class ApiClientError extends Error {
  code: string
  status: number
  requestId?: string
  details?: unknown
  attempts?: number
  method?: string
  path?: string

  constructor(message: string, options: {
    attempts?: number
    code: string
    details?: unknown
    method?: string
    path?: string
    requestId?: string
    status: number
  }) {
    super(message)
    this.name = 'ApiClientError'
    this.code = options.code
    this.status = options.status
    this.requestId = options.requestId
    this.details = options.details
    this.attempts = options.attempts
    this.method = options.method
    this.path = options.path
  }
}

type TokenProvider = () => Promise<string | null>
const MAX_RETRY_DELAY_MS = 5_000

let explicitTokenProvider: TokenProvider | null = null

export function setApiTokenProvider(provider: TokenProvider | null) {
  explicitTokenProvider = provider
}

export function isApiAbortError(error: unknown) {
  return error instanceof ApiClientError && error.code === 'REQUEST_ABORTED'
}

function hasAuthProvider() {
  if (explicitTokenProvider) return true
  if (typeof window === 'undefined') return false
  return Boolean(window.Clerk?.session?.getToken)
}

async function getClerkToken() {
  if (explicitTokenProvider) return explicitTokenProvider()
  if (typeof window === 'undefined') return null
  return window.Clerk?.session?.getToken?.() ?? null
}

async function getTokenWithDeadline(deadlineAt: number, signal?: AbortSignal) {
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    return await Promise.race([
      getClerkToken(),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new DOMException('Aborted', 'AbortError'))
        timeout = globalThis.setTimeout(() => {
          reject(new DOMException('Timed out reading auth token.', 'TimeoutError'))
        }, Math.max(deadlineAt - Date.now(), 0))
        signal?.addEventListener('abort', abort, { once: true })
      }),
    ])
  } finally {
    if (timeout) globalThis.clearTimeout(timeout)
    if (abort) signal?.removeEventListener('abort', abort)
  }
}

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
}

function shouldLogRequests() {
  return import.meta.env.DEV || import.meta.env.VITE_ASTRAOS_API_DEBUG === 'true'
}

function sanitizedPath(path: string) {
  const [base, query] = path.split('?')
  return query ? `${base}?<redacted>` : base
}

function logApiEvent(event: string, details: Record<string, unknown>) {
  if (!shouldLogRequests()) return
  console.info('[AstraOS API]', {
    event,
    ...details,
  })
}

function shouldRetry(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}

async function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    function abort() {
      globalThis.clearTimeout(timeout)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function reservedHeaders(headers: Record<string, string> | undefined) {
  const reserved = new Set(['authorization', 'content-type', 'x-request-id'])
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => !reserved.has(key.toLowerCase())),
  )
}

function apiError(
  message: string,
  options: Omit<ConstructorParameters<typeof ApiClientError>[1], 'method' | 'path'> & { method: string; path: string },
) {
  return new ApiClientError(message, options)
}

function retryDelayMs(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get('retry-after')
  if (retryAfter) {
    const numericRetryAfter = Number(retryAfter)
    if (Number.isFinite(numericRetryAfter)) {
      return Math.min(Math.max(numericRetryAfter * 1000, 0), MAX_RETRY_DELAY_MS)
    }

    const retryDate = Date.parse(retryAfter)
    if (Number.isFinite(retryDate)) return Math.min(Math.max(retryDate - Date.now(), 0), MAX_RETRY_DELAY_MS)
  }

  const backoff = Math.min(250 * (2 ** Math.max(attempt - 1, 0)), 2_000)
  const jitter = Math.floor(Math.random() * 120)
  return Math.min(backoff + jitter, MAX_RETRY_DELAY_MS)
}

async function parseEnvelope<T>(response: Response) {
  const requestId = response.headers.get('x-request-id') ?? undefined
  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? (await response.json().catch(() => null)) as ApiEnvelope<T> | null
    : null

  if (response.ok && payload?.ok) return payload.data as T
  if (response.ok) {
    throw new ApiClientError('API returned an unexpected response format.', {
      code: 'INVALID_API_RESPONSE',
      status: response.status,
      requestId: payload?.requestId ?? requestId,
    })
  }

  throw new ApiClientError(payload?.error?.message ?? `Request failed with ${response.status}`, {
    code: payload?.error?.code ?? 'REQUEST_FAILED',
    status: response.status,
    requestId: payload?.requestId ?? requestId,
    details: payload?.error?.details,
  })
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const method = options.method ?? 'GET'
  const clientRequestId = requestId()
  if (!baseUrl) {
    throw apiError('AstraOS API is not configured.', {
      code: 'API_NOT_CONFIGURED',
      method,
      path,
      requestId: clientRequestId,
      status: 0,
    })
  }

  const retries = options.retries ?? (method === 'GET' ? 2 : 0)
  const timeoutMs = options.timeoutMs ?? 12_000
  const deadlineAt = Date.now() + timeoutMs
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const hasBody = options.body !== undefined
  if (options.signal?.aborted) {
    throw apiError('Request was aborted.', {
      code: 'REQUEST_ABORTED',
      method,
      path,
      requestId: clientRequestId,
      status: 0,
    })
  }

  let serializedBody: string | undefined
  if (hasBody) {
    try {
      serializedBody = JSON.stringify(options.body)
    } catch (error) {
      throw apiError('Request body could not be serialized.', {
        code: 'INVALID_REQUEST_BODY',
        details: error instanceof Error ? error.message : String(error),
        method,
        path,
        requestId: clientRequestId,
        status: 0,
      })
    }
  }

  const authRequired = options.authRequired ?? true
  if (authRequired && !hasAuthProvider()) {
    throw apiError('A signed-in session is required for this API request.', {
      code: 'AUTH_TOKEN_REQUIRED',
      method,
      path,
      requestId: clientRequestId,
      status: 0,
    })
  }

  const token = !authRequired && !hasAuthProvider()
    ? null
    : await getTokenWithDeadline(deadlineAt, options.signal).catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw apiError('Request was aborted.', {
        code: 'REQUEST_ABORTED',
        method,
        path,
        requestId: clientRequestId,
        status: 0,
      })
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw apiError('Request timed out.', {
        code: 'REQUEST_TIMEOUT',
        method,
        path,
        requestId: clientRequestId,
        status: 0,
      })
    }
    throw apiError('Unable to read the authenticated session.', {
      code: 'AUTH_TOKEN_UNAVAILABLE',
      details: error instanceof Error ? error.message : String(error),
      method,
      path,
      requestId: clientRequestId,
      status: 0,
    })
  })
  if (authRequired && !token) {
    throw apiError('A signed-in session is required for this API request.', {
      code: 'AUTH_TOKEN_REQUIRED',
      method,
      path,
      requestId: clientRequestId,
      status: 0,
    })
  }
  let attempt = 0

  while (attempt <= retries) {
    const remainingMs = Math.max(deadlineAt - Date.now(), 0)
    if (remainingMs <= 0) {
      throw apiError('Request timed out.', {
        attempts: attempt,
        code: 'REQUEST_TIMEOUT',
        method,
        path,
        requestId: clientRequestId,
        status: 0,
      })
    }
    const controller = new AbortController()
    let timedOut = false
    let callerAborted = false
    const abortFromCaller = () => {
      callerAborted = true
      controller.abort()
    }
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, remainingMs)
    try {
      const startedAt = now()
      const response = await fetch(url, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'x-request-id': clientRequestId,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...reservedHeaders(options.headers),
        },
        body: serializedBody,
      })
      const duration = Math.round(now() - startedAt)
      logApiEvent('response', {
        attempt: attempt + 1,
        durationMs: duration,
        method,
        path: sanitizedPath(path),
        requestId: clientRequestId,
        status: response.status,
      })
      if (!response.ok && attempt < retries && shouldRetry(response.status)) {
        attempt += 1
        const delayMs = Math.min(retryDelayMs(response, attempt), Math.max(deadlineAt - Date.now(), 0))
        logApiEvent('retry', {
          attempt,
          delayMs,
          method,
          path: sanitizedPath(path),
          requestId: clientRequestId,
          status: response.status,
        })
        await delay(delayMs, options.signal).catch(() => {
          throw apiError('Request was aborted.', {
            code: 'REQUEST_ABORTED',
            method,
            path,
            requestId: clientRequestId,
            status: 0,
          })
        })
        continue
      }
      return await parseEnvelope<T>(response)
    } catch (error) {
      if (error instanceof ApiClientError) {
        logApiEvent('failure', {
          attempts: error.attempts ?? attempt + 1,
          code: error.code,
          method: error.method ?? method,
          path: sanitizedPath(error.path ?? path),
          requestId: error.requestId ?? clientRequestId,
          status: error.status,
        })
        throw error
      }
      if (callerAborted || options.signal?.aborted) {
        throw apiError('Request was aborted.', {
          code: 'REQUEST_ABORTED',
          method,
          path,
          requestId: clientRequestId,
          status: 0,
        })
      }
      if (attempt < retries) {
        attempt += 1
        const delayMs = Math.min(retryDelayMs(null, attempt), Math.max(deadlineAt - Date.now(), 0))
        logApiEvent('retry', {
          attempt,
          delayMs,
          method,
          path: sanitizedPath(path),
          requestId: clientRequestId,
          status: 0,
        })
        await delay(delayMs, options.signal).catch(() => {
          throw apiError('Request was aborted.', {
            code: 'REQUEST_ABORTED',
            method,
            path,
            requestId: clientRequestId,
            status: 0,
          })
        })
        continue
      }
      const message = error instanceof DOMException && error.name === 'AbortError' && timedOut
        ? 'Request timed out.'
        : error instanceof Error ? error.message : 'Network request failed.'
      logApiEvent('failure', {
        attempts: attempt + 1,
        code: error instanceof DOMException && error.name === 'AbortError' && timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        method,
        path: sanitizedPath(path),
        requestId: clientRequestId,
        status: 0,
      })
      throw new ApiClientError(message, {
        attempts: attempt + 1,
        code: error instanceof DOMException && error.name === 'AbortError' && timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        method,
        path,
        requestId: clientRequestId,
        status: 0,
      })
    } finally {
      globalThis.clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  throw new ApiClientError('Request failed after retries.', {
    code: 'REQUEST_RETRIES_EXHAUSTED',
    status: 0,
  })
}

export const apiClient = {
  canUseProtectedApi: () => Boolean(getApiBaseUrl()) && hasAuthProvider(),
  isConfigured: () => Boolean(getApiBaseUrl()),
  request,
  get: <T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
