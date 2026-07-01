import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { apiClient } from '../lib/api/apiClient'
import { createSnapshotId, readAstraLocalSnapshot, snapshotToPayload } from './storage'

interface EdgeResponse<T> {
  data: T
  requestId: string
}

interface HealthResponse {
  service: string
  status: string
}

interface CloudDeadlineRecord {
  _id?: string
  id?: string
}

export interface BackendStatus {
  configured: boolean
  online: boolean
  authenticated: boolean
  provider: 'astraos-api' | 'supabase-edge' | 'local-only'
  emailConfigured: boolean
  message: string
}

export interface DeadlineReminderInput {
  title: string
  description: string
  subject: string
  dueDate: string
  dueTime: string
  remindBefore: string
  remindAt: string
  recipientEmail: string
}

let supabaseClient: SupabaseClient | null = null

function stableDeadlineKey(input: DeadlineReminderInput) {
  const source = [
    input.title,
    input.dueDate,
    input.dueTime,
    input.recipientEmail,
    input.remindBefore,
    input.remindAt,
  ].join('|')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `legacy-deadline:${(hash >>> 0).toString(16)}`
}

export function getAstraBackendConfig() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  return {
    apiBaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    configured: Boolean(apiBaseUrl || (supabaseUrl && supabaseAnonKey)),
    apiConfigured: Boolean(apiBaseUrl),
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  }
}

export function getAstraSupabaseClient() {
  const config = getAstraBackendConfig()
  if (!config.supabaseConfigured || !config.supabaseUrl || !config.supabaseAnonKey) return null
  supabaseClient ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return supabaseClient
}

export async function getAstraSession(): Promise<Session | null> {
  const client = getAstraSupabaseClient()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session ?? null
}

export async function invokeAstraFunction<T>(name: string, body?: Record<string, unknown>) {
  const client = getAstraSupabaseClient()
  if (!client) throw new Error('Supabase is not configured.')
  const { data, error } = await client.functions.invoke<EdgeResponse<T>>(name, { body: body ?? {} })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Empty function response.')
  return data
}

export async function getBackendStatus(): Promise<BackendStatus> {
  const config = getAstraBackendConfig()
  if (config.apiConfigured) {
    try {
      const health = await apiClient.get<HealthResponse>('/health', { authRequired: false, retries: 0 })
      return {
        configured: true,
        online: health.status === 'ok',
        authenticated: apiClient.canUseProtectedApi(),
        provider: 'astraos-api',
        emailConfigured: false,
        message: apiClient.canUseProtectedApi()
          ? `${health.service} online.`
          : `${health.service} online. Sign in with Clerk before cloud writes.`,
      }
    } catch (error) {
      return {
        configured: true,
        online: false,
        authenticated: false,
        provider: 'astraos-api',
        emailConfigured: false,
        message: error instanceof Error ? error.message : 'AstraOS API health check failed.',
      }
    }
  }

  if (!config.configured) {
    return {
      configured: false,
      online: false,
      authenticated: false,
      provider: 'local-only',
      emailConfigured: false,
      message: 'AstraOS API and Supabase environment variables are not configured.',
    }
  }

  try {
    const [session, health] = await Promise.all([
      getAstraSession(),
      invokeAstraFunction<{ emailConfigured: boolean; service: string }>('health'),
    ])
    return {
      configured: true,
      online: true,
      authenticated: Boolean(session),
      provider: 'supabase-edge',
      emailConfigured: Boolean(health.data.emailConfigured),
      message: session ? `${health.data.service} ready.` : 'Backend ready. Sign in before cloud writes.',
    }
  } catch (error) {
    return {
      configured: true,
      online: false,
      authenticated: false,
      provider: 'supabase-edge',
      emailConfigured: false,
      message: error instanceof Error ? error.message : 'Backend health check failed.',
    }
  }
}

export async function stageLegacyLocalData(storage: Storage = window.localStorage) {
  const session = await getAstraSession()
  if (!session) throw new Error('Sign in before importing local AstraOS data.')
  const snapshot = readAstraLocalSnapshot(storage)
  return invokeAstraFunction('import-local-data', {
    idempotencyKey: createSnapshotId(snapshot),
    payload: snapshotToPayload(snapshot),
  })
}

export async function exportCloudData() {
  const session = await getAstraSession()
  if (!session) throw new Error('Sign in before exporting cloud data.')
  return invokeAstraFunction('export-user-data')
}

export async function createDeadlineReminder(input: DeadlineReminderInput) {
  const config = getAstraBackendConfig()
  if (config.apiConfigured) {
    const deadline = await apiClient.post<CloudDeadlineRecord>('/deadlines', {
      title: input.title,
      description: input.description,
      category: input.subject || 'General',
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      reminderEmail: input.recipientEmail,
      remindBefore: input.remindBefore,
      remindAt: input.remindAt || null,
    }, {
      headers: {
        'x-idempotency-key': stableDeadlineKey(input),
      },
    })

    return {
      data: {
        deadlineId: deadline._id ?? deadline.id ?? null,
        provider: 'astraos-api',
      },
      requestId: '',
    }
  }

  const client = getAstraSupabaseClient()
  if (!client) throw new Error('Supabase is not configured.')
  const session = await getAstraSession()
  if (!session) throw new Error('Sign in before creating cloud reminders.')

  const { data: deadline, error: deadlineError } = await client
    .from('deadlines')
    .insert({
      user_id: session.user.id,
      title: input.title,
      due_date: input.dueDate,
      due_time: input.dueTime,
      category: input.subject || 'General',
      description: input.description,
      reminder_email: input.recipientEmail,
      remind_before: input.remindBefore,
    })
    .select('id')
    .single()
  if (deadlineError || !deadline) throw new Error(deadlineError?.message ?? 'Could not create cloud deadline.')

  return invokeAstraFunction('reminders', {
    deadlineId: deadline.id,
    recipientEmail: input.recipientEmail,
    remindAt: input.remindAt,
  })
}
