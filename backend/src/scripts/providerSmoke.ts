import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type SmokeStatus = 'PASS' | 'FAIL' | 'SKIP' | 'WARN'

interface SmokeResult {
  name: string
  status: SmokeStatus
  detail?: string
}

interface ProviderProbe {
  configured?: boolean
  connected?: boolean
  healthy?: boolean
  required?: boolean
  latencyMs?: number
  error?: string
  reason?: string
  status?: string
}

interface ProviderDiagnostics {
  ready?: ProviderProbe
  systemHealth?: ProviderProbe
}

interface JobProbe {
  configured?: boolean
  enabled?: boolean
  healthy?: boolean
  reason?: string
  status?: string
}

const apiBase = (
  process.env.ASTRAOS_SMOKE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  'http://127.0.0.1:3000/api'
).replace(/\/$/, '')

const targetEnv = (process.env.ASTRAOS_SMOKE_TARGET_ENV || process.env.NODE_ENV || 'development').toLowerCase()
const webUrl = process.env.ASTRAOS_SMOKE_WEB_URL
const bearerToken = process.env.ASTRAOS_SMOKE_BEARER_TOKEN || process.env.ASTRAOS_SMOKE_CLERK_TOKEN
const useDevAuth = boolEnv('ASTRAOS_SMOKE_USE_DEV_AUTH')
const devUser = process.env.ASTRAOS_SMOKE_DEV_USER || (useDevAuth ? 'smoke_user' : undefined)
const opsToken = process.env.ASTRAOS_SMOKE_OPS_TOKEN || process.env.ASTRAOS_OPS_TOKEN
const requireReady = boolEnv('ASTRAOS_SMOKE_REQUIRE_READY')
const requireOpenRouter = boolEnv('ASTRAOS_SMOKE_REQUIRE_OPENROUTER')
const fullCloudinary = boolEnv('ASTRAOS_SMOKE_FULL_CLOUDINARY')
const smokeReportFile = process.env.ASTRAOS_SMOKE_REPORT_FILE
const requestTimeoutMs = numberEnv('ASTRAOS_SMOKE_TIMEOUT_MS', 12_000, 1000, 120_000)
const corsDenyOrigin = process.env.ASTRAOS_SMOKE_CORS_DENY_ORIGIN
const providerDiagnostics: Record<string, ProviderDiagnostics> = {}
const jobDiagnostics: Record<string, { ready?: JobProbe; systemHealth?: JobProbe }> = {}
const endpointDiagnostics: {
  ready?: { status?: string; blockers?: string[]; httpStatus?: number }
  systemHealth?: { status?: string; configured?: number; healthy?: number; httpStatus?: number }
} = {}

function boolEnv(name: string) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').toLowerCase())
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name])
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

function pass(name: string, detail?: string): SmokeResult {
  return detail ? { name, status: 'PASS', detail } : { name, status: 'PASS' }
}

function fail(name: string, detail: string): SmokeResult {
  return { name, status: 'FAIL', detail }
}

function skipped(name: string, detail: string): SmokeResult {
  return { name, status: 'SKIP', detail }
}

function warn(name: string, detail: string): SmokeResult {
  return { name, status: 'WARN', detail }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProviderName(name: string) {
  const collapsed = name.toLowerCase().replace(/[-_\s]/g, '')
  if (collapsed === 'openrouter') return 'openrouter'
  if (collapsed === 'upstashredis') return 'redis'
  return collapsed
}

function toBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toStringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function resetSmokeDiagnostics() {
  for (const key of Object.keys(providerDiagnostics)) delete providerDiagnostics[key]
  for (const key of Object.keys(jobDiagnostics)) delete jobDiagnostics[key]
  delete endpointDiagnostics.ready
  delete endpointDiagnostics.systemHealth
}

export function captureProviderDiagnostics(source: keyof ProviderDiagnostics, providers: unknown) {
  if (!isRecord(providers)) return

  for (const [rawName, rawProvider] of Object.entries(providers)) {
    if (!isRecord(rawProvider)) continue
    const name = normalizeProviderName(rawName)
    providerDiagnostics[name] = {
      ...providerDiagnostics[name],
      [source]: {
        configured: toBoolean(rawProvider.configured),
        connected: toBoolean(rawProvider.connected),
        healthy: toBoolean(rawProvider.healthy),
        required: toBoolean(rawProvider.required),
        latencyMs: toNumber(rawProvider.latencyMs),
        error: toStringValue(rawProvider.error),
        reason: toStringValue(rawProvider.reason),
        status: toStringValue(rawProvider.status),
      },
    }
  }
}

export function captureJobDiagnostics(source: 'ready' | 'systemHealth', jobs: unknown) {
  if (!isRecord(jobs)) return

  for (const [rawName, rawJob] of Object.entries(jobs)) {
    if (!isRecord(rawJob)) continue
    const name = normalizeProviderName(rawName)
    jobDiagnostics[name] = {
      ...jobDiagnostics[name],
      [source]: {
        configured: toBoolean(rawJob.configured),
        enabled: toBoolean(rawJob.enabled),
        healthy: toBoolean(rawJob.healthy),
        reason: toStringValue(rawJob.reason),
        status: toStringValue(rawJob.status),
      },
    }
  }
}

function compactProviderDetails() {
  return Object.fromEntries(
    Object.entries(providerDiagnostics)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function compactJobDetails() {
  return Object.fromEntries(
    Object.entries(jobDiagnostics)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

export function summarize(results: SmokeResult[]) {
  const counts: Record<Lowercase<SmokeStatus>, number> = {
    fail: 0,
    pass: 0,
    skip: 0,
    warn: 0,
  }

  for (const result of results) {
    counts[result.status.toLowerCase() as Lowercase<SmokeStatus>] += 1
  }

  return {
    total: results.length,
    ...counts,
    ok: counts.fail === 0,
  }
}

function authMode() {
  if (targetEnv === 'production' && (useDevAuth || devUser)) return 'invalid-dev-auth'
  if (bearerToken) return 'bearer'
  if (devUser) return 'dev-header'
  return 'none'
}

export function buildSmokeReport(results: SmokeResult[], startedAt: number) {
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    target: {
      apiBase,
      authMode: authMode(),
      requestTimeoutMs,
      targetEnv,
      webUrl: webUrl ?? null,
    },
    summary: summarize(results),
    checks: results,
    results,
    endpointDiagnostics,
    jobDetails: compactJobDetails(),
    providerDetails: compactProviderDetails(),
  }
}

function providerProbeLabel(probe: ProviderProbe | undefined) {
  if (!probe) return 'unknown'
  const status = probe.status ?? (probe.healthy ? 'healthy' : probe.configured ? 'unhealthy' : 'missing')
  const reason = probe.reason ? `:${probe.reason}` : ''
  const required = probe.required ? ',required' : ''
  const latency = typeof probe.latencyMs === 'number' ? `,${probe.latencyMs}ms` : ''
  return `${status}${reason}${required}${latency}`
}

function jobProbeLabel(probe: JobProbe | undefined) {
  if (!probe) return 'unknown'
  const status = probe.status ?? (probe.healthy ? 'healthy' : probe.enabled ? 'unhealthy' : 'disabled')
  return probe.reason ? `${status}:${probe.reason}` : status
}

export function formatSmokeInfoLines(results: SmokeResult[]) {
  const summary = summarize(results)
  const lines = [`INFO summary - pass=${summary.pass} warn=${summary.warn} skip=${summary.skip} fail=${summary.fail}`]
  const strictFlags = [
    requireReady ? 'require-ready' : '',
    requireOpenRouter ? 'require-openrouter' : '',
    fullCloudinary ? 'full-cloudinary' : '',
  ].filter(Boolean)

  lines.push(`INFO strict-flags - ${strictFlags.length ? strictFlags.join(',') : 'none'}`)

  const providers = compactProviderDetails()
  const providerLine = Object.entries(providers)
    .map(([name, detail]) => `${name}=ready:${providerProbeLabel(detail.ready)} system:${providerProbeLabel(detail.systemHealth)}`)
    .join('; ')
  if (providerLine) lines.push(`INFO providers - ${providerLine}`)

  const jobs = compactJobDetails()
  const jobLine = Object.entries(jobs)
    .map(([name, detail]) => `${name}=ready:${jobProbeLabel(detail.ready)} system:${jobProbeLabel(detail.systemHealth)}`)
    .join('; ')
  if (jobLine) lines.push(`INFO jobs - ${jobLine}`)

  return lines
}

async function writeSmokeReport(filePath: string, results: SmokeResult[], startedAt: number) {
  const absolutePath = resolve(filePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, JSON.stringify(buildSmokeReport(results, startedAt), null, 2))
}

function authHeaders(): Record<string, string> | null {
  if (bearerToken) return { Authorization: `Bearer ${bearerToken}` }
  if (devUser && targetEnv !== 'production') return { 'x-astra-dev-user': devUser }
  return null
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>
}

async function request(path: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    return await fetch(`${apiBase}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function check(name: string, fn: () => Promise<string | void>): Promise<SmokeResult> {
  try {
    const detail = await fn()
    return detail === undefined ? pass(name) : pass(name, detail)
  } catch (error) {
    return fail(name, error instanceof Error ? error.message : String(error))
  }
}

function dataId(payload: Record<string, unknown> | null) {
  const data = payload?.data as { _id?: string; id?: string } | undefined
  return String(data?._id ?? data?.id ?? '')
}

async function checkHealth() {
  return check('health', async () => {
    const response = await request('/health')
    const payload = await readJson(response)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return String((payload?.data as { service?: string } | undefined)?.service ?? 'health ok')
  })
}

async function checkReady(): Promise<SmokeResult> {
  try {
    const response = await request('/ready')
    const payload = await readJson(response)
    if (![200, 503].includes(response.status)) throw new Error(`HTTP ${response.status}`)
    const data = payload?.data as { status?: string; blockers?: string[]; jobs?: unknown; providers?: unknown } | undefined
    const status = data?.status ?? String(response.status)
    const blockers = data?.blockers?.length ? ` blockers=${data.blockers.join(',')}` : ''
    endpointDiagnostics.ready = {
      httpStatus: response.status,
      status,
      blockers: data?.blockers ?? [],
    }
    captureProviderDiagnostics('ready', data?.providers)
    captureJobDiagnostics('ready', data?.jobs)
    if (response.status === 200 && status === 'ready') return pass('ready', 'status=ready')
    if (requireReady) return fail('ready', `status=${status}${blockers}`)
    return warn('ready', `status=${status}${blockers}`)
  } catch (error) {
    return fail('ready', error instanceof Error ? error.message : String(error))
  }
}

async function checkCors(): Promise<SmokeResult> {
  if (!webUrl) return skipped('cors', 'ASTRAOS_SMOKE_WEB_URL is not set.')
  return check('cors', async () => {
    const allowed = await request('/health', { headers: { Origin: webUrl } })
    if (!allowed.ok) throw new Error(`allowed GET HTTP ${allowed.status}`)
    const allowedOrigin = allowed.headers.get('access-control-allow-origin')
    if (allowedOrigin !== webUrl && allowedOrigin !== '*') {
      throw new Error(`unexpected allow-origin=${allowedOrigin ?? 'missing'}`)
    }

    const preflight = await request('/health', {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Headers': 'authorization,content-type,x-astra-dev-user,x-idempotency-key',
        'Access-Control-Request-Method': 'POST',
        Origin: webUrl,
      },
    })
    if (![200, 204].includes(preflight.status)) throw new Error(`preflight HTTP ${preflight.status}`)

    if (corsDenyOrigin) {
      const denied = await request('/health', { headers: { Origin: corsDenyOrigin } })
      const deniedAllowOrigin = denied.headers.get('access-control-allow-origin')
      if (denied.ok && deniedAllowOrigin === corsDenyOrigin) {
        throw new Error(`denied origin was allowed: ${corsDenyOrigin}`)
      }
      return `origin=${allowedOrigin}; preflight=${preflight.status}; denied=${denied.status}`
    }

    return `origin=${allowedOrigin}; preflight=${preflight.status}`
  })
}

async function checkSystemHealth() {
  if (!opsToken) return skipped('system-health', 'ASTRAOS_SMOKE_OPS_TOKEN or ASTRAOS_OPS_TOKEN is not set.')
  return check('system-health', async () => {
    const response = await request('/system/health', { headers: { 'x-astra-ops-token': opsToken } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await readJson(response)
    const data = isRecord(payload?.data) ? payload.data : {}
    const providersRecord = isRecord(data.providers) ? data.providers : {}
    const jobsRecord = isRecord(data.jobs) ? data.jobs : {}
    const summaryRecord = isRecord(data.summary) ? data.summary : {}
    endpointDiagnostics.systemHealth = {
      httpStatus: response.status,
      status: toStringValue(data.status),
      configured: toNumber(summaryRecord.configured),
      healthy: toNumber(summaryRecord.healthy),
    }
    captureProviderDiagnostics('systemHealth', providersRecord)
    captureJobDiagnostics('systemHealth', jobsRecord)
    const providers = Object.keys(providersRecord).length
      ? Object.entries(providersRecord)
        .map(([name, status]) => isRecord(status)
          ? `${name}:configured=${Boolean(status.configured)},healthy=${Boolean(status.healthy)}`
          : `${name}:status=unknown`)
        .join('; ')
      : 'providers unknown'
    const jobs = Object.keys(jobsRecord).length
      ? Object.entries(jobsRecord)
        .map(([name, status]) => isRecord(status)
          ? `${name}:status=${String(status.status ?? 'unknown')},healthy=${Boolean(status.healthy)}`
          : `${name}:status=unknown`)
        .join('; ')
      : 'jobs unknown'
    return `${providers}; jobs=${jobs}`
  })
}

async function checkDailyQuiz() {
  return check('daily-quiz', async () => {
    const response = await request('/quiz/daily')
    const payload = await readJson(response)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const questions = (payload?.data as { questions?: unknown[] } | undefined)?.questions
    if (!Array.isArray(questions) || questions.length < 5) {
      throw new Error(`expected at least 5 questions, received ${questions?.length ?? 0}`)
    }
    return `${questions.length} questions`
  })
}

async function checkMe(headers: Record<string, string>) {
  return check('auth-user', async () => {
    const response = await request('/users/me', { headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await readJson(response)
    const auth = (payload?.data as { auth?: { userId?: string } } | undefined)?.auth
    return auth?.userId ? `user=${auth.userId}` : 'authenticated'
  })
}

async function crudSmoke(
  name: string,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  return check(name, async () => {
    let id = ''
    try {
      const create = await request(path, {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': smokeIdempotencyKey(name) },
        body: JSON.stringify(body),
      })
      const created = await readJson(create)
      if (!create.ok) throw new Error(`create HTTP ${create.status}`)
      id = dataId(created)

      const list = await request(`${path}?limit=5`, { headers })
      if (!list.ok) throw new Error(`list HTTP ${list.status}`)

      if (id) {
        const remove = await request(`${path}/${id}`, { method: 'DELETE', headers })
        if (!remove.ok) throw new Error(`delete HTTP ${remove.status}`)
      }
      return id ? `created/listed/deleted ${id}` : 'created/listed'
    } catch (error) {
      if (id) await request(`${path}/${id}`, { method: 'DELETE', headers }).catch(() => undefined)
      throw error
    }
  })
}

function smokeSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function smokeIdempotencyKey(name: string) {
  const safeName = name.replace(/[^a-zA-Z0-9._:-]/g, ':')
  return `smoke:${safeName}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

async function checkSettings(headers: Record<string, string>) {
  return check('settings', async () => {
    const patch = await request('/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        flags: { smokeLastRunAt: new Date().toISOString() },
        preferences: { smokeTargetEnv: targetEnv },
      }),
    })
    if (!patch.ok) throw new Error(`patch HTTP ${patch.status}`)
    const get = await request('/settings', { headers })
    if (!get.ok) throw new Error(`get HTTP ${get.status}`)
    return 'patch/get ok'
  })
}

async function checkAiVaultNote(headers: Record<string, string>) {
  return check('vault-note', async () => {
    let id = ''
    try {
      const suffix = smokeSuffix()
      const create = await request('/ai-vault/documents', {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': smokeIdempotencyKey('vault-note') },
        body: JSON.stringify({
          title: `Smoke note ${suffix}`,
          sourceType: 'note',
          bytes: 0,
          contentHash: `smoke_note_${suffix}`,
          tags: ['smoke'],
        }),
      })
      const created = await readJson(create)
      if (!create.ok) throw new Error(`create HTTP ${create.status}`)
      id = dataId(created)
      if (!id) throw new Error('created note did not include an id')

      const chunks = await request(`/ai-vault/documents/${id}/chunks`, {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': smokeIdempotencyKey('vault-note-chunks') },
        body: JSON.stringify({
          text: `AstraOS smoke note ${suffix}.\nThis verifies text chunk ingestion without embeddings.`,
        }),
      })
      if (!chunks.ok) throw new Error(`chunks HTTP ${chunks.status}`)

      const list = await request('/ai-vault/documents?limit=5', { headers })
      if (!list.ok) throw new Error(`list HTTP ${list.status}`)

      const remove = await request(`/ai-vault/documents/${id}`, { method: 'DELETE', headers })
      if (!remove.ok) throw new Error(`delete HTTP ${remove.status}`)
      return `created/chunked/listed/deleted ${id}`
    } catch (error) {
      if (id) await request(`/ai-vault/documents/${id}`, { method: 'DELETE', headers }).catch(() => undefined)
      throw error
    }
  })
}

async function checkAssistant(headers: Record<string, string>) {
  try {
    const response = await request('/assistant/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'Reply with one short AstraOS smoke-test sentence.', mode: 'Brief' }),
    })
    const payload = await readJson(response)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const provider = String((payload?.data as { provider?: string } | undefined)?.provider ?? 'unknown')
    if (requireOpenRouter && provider !== 'openrouter') {
      return fail('assistant', `expected openrouter, received ${provider}`)
    }
    if (provider !== 'openrouter') return warn('assistant', `provider=${provider}`)
    return pass('assistant', `provider=${provider}`)
  } catch (error) {
    return fail('assistant', error instanceof Error ? error.message : String(error))
  }
}

async function checkVaultUpload(headers: Record<string, string>) {
  const filePath = process.env.ASTRAOS_SMOKE_UPLOAD_FILE
  if (!filePath) {
    return fullCloudinary
      ? fail('vault-upload', 'ASTRAOS_SMOKE_FULL_CLOUDINARY is set but ASTRAOS_SMOKE_UPLOAD_FILE is missing.')
      : skipped('vault-upload', 'ASTRAOS_SMOKE_UPLOAD_FILE is not set.')
  }

  return check('vault-upload', async () => {
    let registeredId = ''
    let uploadedPublicId = ''
    const bytes = await readFile(filePath)
    const filename = basename(filePath)
    const contentType = process.env.ASTRAOS_SMOKE_UPLOAD_CONTENT_TYPE || 'text/plain'
    try {
      const signature = await request('/uploads/signature', {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': smokeIdempotencyKey('vault-upload-signature') },
        body: JSON.stringify({
          folder: 'ai-vault/smoke',
          contentType,
          bytes: bytes.byteLength,
          resourceType: 'raw',
        }),
      })
      const signaturePayload = await readJson(signature)
      if (!signature.ok) throw new Error(`signature HTTP ${signature.status}`)
      const sig = signaturePayload?.data as {
        apiKey: string
        cloudName: string
        folder: string
        publicId: string
        resourceType: string
        signature: string
        timestamp: number
        uploadParams?: Record<string, string | number>
      }
      const form = new FormData()
      form.set('file', new Blob([bytes], { type: contentType }), filename)
      form.set('api_key', sig.apiKey)
      const uploadParams = sig.uploadParams ?? {
        folder: sig.folder,
        overwrite: 'false',
        public_id: sig.publicId,
        resource_type: sig.resourceType,
        signature: sig.signature,
        timestamp: sig.timestamp,
        unique_filename: 'false',
      }
      for (const [key, value] of Object.entries(uploadParams)) {
        form.set(key, String(value))
      }
      const upload = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${sig.resourceType}/upload`, {
        method: 'POST',
        body: form,
      })
      const uploadPayload = await upload.json().catch(() => null) as {
        public_id?: string
        bytes?: number
        resource_type?: string
      } | null
      if (!upload.ok || !uploadPayload?.public_id) throw new Error(`cloudinary HTTP ${upload.status}`)
      uploadedPublicId = uploadPayload.public_id

      const register = await request('/ai-vault/documents', {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': smokeIdempotencyKey('vault-upload-register') },
        body: JSON.stringify({
          title: filename,
          sourceType: 'upload',
          cloudinaryPublicId: uploadedPublicId,
          cloudinaryResourceType: uploadPayload.resource_type ?? sig.resourceType,
          originalFilename: filename,
          contentType,
          bytes: uploadPayload.bytes ?? bytes.byteLength,
          contentHash: `smoke_upload_${smokeSuffix()}`,
          tags: ['folder:smoke'],
        }),
      })
      const registered = await readJson(register)
      if (!register.ok) throw new Error(`register HTTP ${register.status}; uploadedPublicId=${uploadedPublicId}`)
      registeredId = dataId(registered)

      const list = await request('/ai-vault/documents?limit=5', { headers })
      if (!list.ok) throw new Error(`vault list HTTP ${list.status}`)
      const assets = await request('/ai-vault/storage/assets', { headers })
      if (!assets.ok) throw new Error(`asset list HTTP ${assets.status}`)
      if (registeredId) {
        const remove = await request(`/ai-vault/documents/${registeredId}`, { method: 'DELETE', headers })
        if (!remove.ok) throw new Error(`delete HTTP ${remove.status}; uploadedPublicId=${uploadedPublicId}`)
      }
      return registeredId
        ? `uploaded/register/listed/deleted ${registeredId}`
        : `uploaded/register/listed; uploadedPublicId=${uploadedPublicId}`
    } catch (error) {
      if (registeredId) await request(`/ai-vault/documents/${registeredId}`, { method: 'DELETE', headers }).catch(() => undefined)
      throw error
    }
  })
}

function authMissingResults(): SmokeResult[] {
  const missing = 'Set ASTRAOS_SMOKE_BEARER_TOKEN/ASTRAOS_SMOKE_CLERK_TOKEN, or ASTRAOS_SMOKE_USE_DEV_AUTH=1 outside production.'
  return [
    skipped('auth-user', missing),
    skipped('tasks-crud', missing),
    skipped('bookmarks-crud', missing),
    skipped('deadlines-crud', missing),
    skipped('health-logs-crud', missing),
    skipped('entertainment-crud', missing),
    skipped('settings', missing),
    skipped('vault-note', missing),
    requireOpenRouter ? fail('assistant', `ASTRAOS_SMOKE_REQUIRE_OPENROUTER is set. ${missing}`) : skipped('assistant', missing),
    fullCloudinary ? fail('vault-upload', `ASTRAOS_SMOKE_FULL_CLOUDINARY is set. ${missing}`) : skipped('vault-upload', missing),
  ]
}

async function authenticatedResults(headers: Record<string, string>) {
  return [
    await checkMe(headers),
    await crudSmoke('tasks-crud', '/tasks', headers, {
      title: `Smoke task ${smokeSuffix()}`,
      notes: 'Created by AstraOS provider smoke.',
      status: 'todo',
      priority: 'low',
      tags: ['smoke'],
      estimateMinutes: 25,
      dueDate: null,
    }),
    await crudSmoke('bookmarks-crud', '/bookmarks', headers, {
      title: `Smoke bookmark ${smokeSuffix()}`,
      url: 'https://example.com/astraos-smoke',
      category: 'Smoke',
      description: 'Created by AstraOS provider smoke.',
    }),
    await crudSmoke('deadlines-crud', '/deadlines', headers, {
      title: `Smoke deadline ${smokeSuffix()}`,
      description: 'Created by AstraOS provider smoke.',
      category: 'Smoke',
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      dueTime: '23:59',
      reminderEmail: '',
      remindBefore: '1d',
    }),
    await crudSmoke('health-logs-crud', '/health-logs', headers, {
      type: 'custom',
      date: new Date().toISOString().slice(0, 10),
      metrics: { smoke: true },
      notes: 'Created by AstraOS provider smoke.',
    }),
    await crudSmoke('entertainment-crud', '/entertainment-data', headers, {
      type: 'preference',
      data: { smoke: true, targetEnv },
    }),
    await checkSettings(headers),
    await checkAiVaultNote(headers),
    await checkAssistant(headers),
    await checkVaultUpload(headers),
  ]
}

async function main() {
  const startedAt = Date.now()
  const results: SmokeResult[] = []
  results.push(pass('target', `${targetEnv} ${apiBase}`))

  if (targetEnv === 'production' && (useDevAuth || devUser)) {
    results.push(fail('auth-mode', 'Dev auth is not allowed for production smoke tests. Use a Clerk bearer token.'))
  } else if (bearerToken) {
    results.push(pass('auth-mode', 'bearer'))
  } else if (devUser) {
    results.push(warn('auth-mode', 'dev header; backend must have ASTRAOS_ALLOW_DEV_AUTH=true'))
  } else {
    results.push(skipped('auth-mode', 'No auth token/dev user configured.'))
  }

  results.push(await checkHealth())
  results.push(await checkReady())
  results.push(await checkCors())
  results.push(await checkSystemHealth())
  results.push(await checkDailyQuiz())

  const headers = authHeaders()
  if (!headers || results.some((result) => result.name === 'auth-mode' && result.status === 'FAIL')) {
    results.push(...authMissingResults())
  } else {
    results.push(...await authenticatedResults(headers))
  }

  for (const result of results) {
    console.log(`${result.status} ${result.name}${result.detail ? ` - ${result.detail}` : ''}`)
  }
  for (const line of formatSmokeInfoLines(results)) {
    console.log(line)
  }

  if (smokeReportFile) {
    await writeSmokeReport(smokeReportFile, results, startedAt)
  }

  if (results.some((result) => result.status === 'FAIL')) {
    process.exitCode = 1
  }
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectRun()) {
  void main()
}
