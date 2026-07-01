import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../lib/api/apiClient'
import { createDeadlineReminder, getBackendStatus } from './backend'

vi.mock('../lib/api/apiClient', () => ({
  apiClient: {
    canUseProtectedApi: vi.fn(),
    get: vi.fn(),
    isConfigured: vi.fn(),
    post: vi.fn(),
  },
}))

const reminderInput = {
  title: 'Submit physics project',
  description: 'Final review before upload',
  subject: 'Physics',
  dueDate: '2026-06-15',
  dueTime: '18:30',
  remindBefore: '1d',
  remindAt: '2026-06-14T18:30:00.000Z',
  recipientEmail: 'student@example.com',
}

describe('legacy backend bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reports local-only mode without Supabase-specific wording when no backend is configured', async () => {
    await expect(getBackendStatus()).resolves.toMatchObject({
      authenticated: false,
      configured: false,
      online: false,
      provider: 'local-only',
      message: 'AstraOS API and Supabase environment variables are not configured.',
    })
  })

  it('keeps API health separate from protected cloud-write readiness', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
    vi.mocked(apiClient.get).mockResolvedValue({ service: 'AstraOS API', status: 'ok' })
    vi.mocked(apiClient.canUseProtectedApi).mockReturnValue(false)

    await expect(getBackendStatus()).resolves.toMatchObject({
      authenticated: false,
      configured: true,
      online: true,
      provider: 'astraos-api',
      message: 'AstraOS API online. Sign in with Clerk before cloud writes.',
    })
  })

  it('creates legacy deadline reminders through the AstraOS API when API mode is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
    vi.mocked(apiClient.post).mockResolvedValue({ _id: '507f1f77bcf86cd799439011' })

    const result = await createDeadlineReminder(reminderInput)

    expect(result).toMatchObject({
      data: {
        deadlineId: '507f1f77bcf86cd799439011',
        provider: 'astraos-api',
      },
    })
    expect(apiClient.post).toHaveBeenCalledWith(
      '/deadlines',
      {
        title: reminderInput.title,
        description: reminderInput.description,
        category: reminderInput.subject,
        dueDate: reminderInput.dueDate,
        dueTime: reminderInput.dueTime,
        reminderEmail: reminderInput.recipientEmail,
        remindBefore: reminderInput.remindBefore,
        remindAt: reminderInput.remindAt,
      },
      {
        headers: {
          'x-idempotency-key': expect.stringMatching(/^legacy-deadline:[a-f0-9]+$/),
        },
      },
    )
  })
})
