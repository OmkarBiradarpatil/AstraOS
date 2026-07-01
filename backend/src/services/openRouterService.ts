import { ApiError } from '../utils/http.js'
import { boolEnv, env } from '../utils/env.js'
import { cacheHash, getCachedJson, setCachedJson } from './redisService.js'

interface GenerateReplyInput {
  message: string
  userId: string
  conversationId?: string | null
  mode?: string
  history?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

interface AssistantReply {
  provider: 'openrouter' | 'local-fallback'
  model: string
  content: string
  usage: null | {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  cache?: 'hit' | 'miss' | 'bypass'
  latencyMs?: number
}

interface OpenRouterPayload {
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

const DEFAULT_OPENROUTER_MODEL = 'openrouter/free'
const DEFAULT_OPENROUTER_TIMEOUT_MS = 8_000
const DEFAULT_OPENROUTER_CACHE_SECONDS = 300

function localReply(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('vault')) return 'AI Vault is preserved. Production mode will store documents, chunks, summaries, and retrieval metadata server-side.'
  if (lower.includes('security')) return 'Security hardening path: Clerk auth, Mongo ownership checks, Cloudinary signed uploads, Redis rate limits, and server-only AI keys.'
  if (lower.includes('backend')) return 'The Express backend is being added as an additive target-stack bridge so existing UI behavior stays intact.'
  return 'AstraOS AI is available in local-safe mode. Configure OPENROUTER_API_KEY for fast provider-backed answers.'
}

function csv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(env(name))
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

function openRouterTimeoutMs() {
  return numberEnv('OPENROUTER_TIMEOUT_MS', DEFAULT_OPENROUTER_TIMEOUT_MS, 1000, 30_000)
}

function openRouterCacheSeconds() {
  return numberEnv('OPENROUTER_CACHE_SECONDS', DEFAULT_OPENROUTER_CACHE_SECONDS, 0, 86_400)
}

function openRouterModels() {
  const modelList = csv(env('OPENROUTER_MODELS'))
  if (modelList.length) return modelList

  const primary = env('OPENROUTER_MODEL') ?? DEFAULT_OPENROUTER_MODEL
  const fallbacks = csv(env('OPENROUTER_MODEL_FALLBACKS')).filter((model) => model !== primary)
  return [primary, ...fallbacks]
}

function systemPrompt(mode: string | undefined) {
  const base = 'You are AYNTK, the AstraOS assistant. Be fast, accurate, safe, and practical. Do not expose secrets. Prefer concise markdown with concrete next steps.'
  const normalized = (mode ?? '').toLowerCase()
  if (normalized.includes('research')) return `${base} In Researcher mode, give a structured answer with useful depth and clear tradeoffs.`
  if (normalized.includes('brief')) return `${base} In Brief mode, stay under three short sentences.`
  if (normalized.includes('coder')) return `${base} In Coder mode, include working code when it materially helps and explain it briefly.`
  return base
}

function buildMessages(input: GenerateReplyInput) {
  const history = (input.history ?? [])
    .filter((message) => message.content.trim())
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 4000),
    }))

  return [
    { role: 'system' as const, content: systemPrompt(input.mode) },
    ...history,
    { role: 'user' as const, content: input.message },
  ]
}

function cacheKey(input: GenerateReplyInput) {
  return `ai:reply:${cacheHash(input.userId)}:${cacheHash(JSON.stringify({
    message: input.message,
    mode: input.mode ?? 'assistant',
    history: (input.history ?? []).slice(-6),
  }))}`
}

function providerIdentifier(value: string) {
  return cacheHash(value).slice(0, 64)
}

function openRouterBody(input: GenerateReplyInput) {
  const models = openRouterModels()
  return {
    ...(models.length > 1 ? { models } : { model: models[0] ?? DEFAULT_OPENROUTER_MODEL }),
    messages: buildMessages(input),
    temperature: 0.35,
    max_tokens: 700,
    user: providerIdentifier(input.userId),
    ...(input.conversationId ? { session_id: providerIdentifier(input.conversationId) } : {}),
  }
}

export async function generateAssistantReply(input: GenerateReplyInput): Promise<AssistantReply> {
  const key = cacheKey(input)
  const existing = await getCachedJson<AssistantReply>(key)
  if (existing) return { ...existing, cache: 'hit', latencyMs: 0 }

  const reply = await generateAssistantReplyUncached(input)
  const cacheSeconds = openRouterCacheSeconds()
  if (reply.provider === 'openrouter' && cacheSeconds > 0) {
    await setCachedJson(key, reply, cacheSeconds)
    return { ...reply, cache: 'miss' }
  }

  return { ...reply, cache: 'bypass' }
}

async function generateAssistantReplyUncached(input: GenerateReplyInput): Promise<AssistantReply> {
  const apiKey = env('OPENROUTER_API_KEY')
  if (!apiKey) {
    return {
      provider: 'local-fallback',
      model: 'local',
      content: localReply(input.message),
      usage: null,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), openRouterTimeoutMs())
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env('WEB_ORIGIN') ?? 'http://localhost:5175',
        'X-Title': 'AstraOS',
      },
      body: JSON.stringify(openRouterBody(input)),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (boolEnv('OPENROUTER_FAIL_CLOSED')) {
        throw new ApiError(504, 'AI_PROVIDER_TIMEOUT', 'AI provider request timed out.')
      }
      return {
        provider: 'local-fallback',
        model: 'local',
        content: 'AYNTK cloud AI is taking too long right now, so I switched to instant safe mode. Try again in a moment for the provider-backed answer.',
        usage: null,
        latencyMs: Date.now() - startedAt,
      }
    }
    if (boolEnv('OPENROUTER_FAIL_CLOSED')) throw error
    return {
      provider: 'local-fallback',
      model: 'local',
      content: localReply(input.message),
      usage: null,
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    if (boolEnv('OPENROUTER_FAIL_CLOSED')) {
      throw new ApiError(response.status, 'AI_PROVIDER_FAILED', 'AI provider request failed.')
    }
    return {
      provider: 'local-fallback',
      model: 'local',
      content: localReply(input.message),
      usage: null,
      latencyMs: Date.now() - startedAt,
    }
  }

  let payload: OpenRouterPayload
  try {
    payload = await response.json() as OpenRouterPayload
  } catch {
    if (boolEnv('OPENROUTER_FAIL_CLOSED')) {
      throw new ApiError(502, 'AI_INVALID_RESPONSE', 'AI provider returned invalid JSON.')
    }
    return {
      provider: 'local-fallback',
      model: 'local',
      content: localReply(input.message),
      usage: null,
      latencyMs: Date.now() - startedAt,
    }
  }
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) {
    if (boolEnv('OPENROUTER_FAIL_CLOSED')) {
      throw new ApiError(502, 'AI_EMPTY_RESPONSE', 'AI provider returned an empty response.')
    }
    return {
      provider: 'local-fallback',
      model: 'local',
      content: localReply(input.message),
      usage: null,
      latencyMs: Date.now() - startedAt,
    }
  }
  return {
    provider: 'openrouter',
    model: payload.model ?? openRouterModels()[0] ?? DEFAULT_OPENROUTER_MODEL,
    content,
    usage: payload.usage ?? null,
    latencyMs: Date.now() - startedAt,
  }
}
