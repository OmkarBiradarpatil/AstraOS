import { useMemo, useState } from 'react'
import { apiClient } from '../../lib/api/apiClient'
import { nowIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import type { AssistantMessage } from '../../types/domain'

const initialMessages: AssistantMessage[] = []

function buildLocalReply(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('backend')) {
    return 'Backend gaps are being mapped feature-by-feature before any endpoint is implemented. That keeps the rebuild honest.'
  }
  if (lower.includes('task')) {
    return 'The task module now has typed validation, filters, and local persistence. Next stop is ownership-backed database rows.'
  }
  if (lower.includes('security')) {
    return 'Security priorities: real auth, row-level security, validation, sanitized rendering, and removing localStorage secrets.'
  }
  return 'Local assistant mode captured your note. The production path is a server-side AI function with rate limits, logging, and user ownership checks.'
}

interface AssistantResponse {
  conversationId: string | null
  reply: string
  provider: string
  model: string
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Assistant request failed.'
}

export function useAssistant() {
  const [messages, setMessages] = usePersistentState<AssistantMessage[]>(
    'astraos.assistant.messages',
    initialMessages,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloudConfigured = apiClient.canUseProtectedApi()

  return useMemo(
    () => ({
      messages,
      isLoading,
      error,
      isCloudBacked: cloudConfigured && !error,
      async sendMessage(content: string) {
        const trimmed = content.trim()
        if (!trimmed) return
        const userMessage: AssistantMessage = {
          id: uid('msg'),
          role: 'user',
          content: trimmed,
          createdAt: nowIso(),
        }
        setMessages((current) => [...current, userMessage])

        if (!cloudConfigured) {
          setMessages((current) => [
            ...current,
            {
              id: uid('msg'),
              role: 'assistant',
              content: buildLocalReply(trimmed),
              createdAt: nowIso(),
            },
          ])
          return
        }

        setIsLoading(true)
        try {
          const history = messages.slice(-10).map((message) => ({
            role: message.role,
            content: message.content,
          }))
          const response = await apiClient.post<AssistantResponse>(
            '/assistant/messages',
            { message: trimmed, history },
            { retries: 0, timeoutMs: 14_000 },
          )
          setMessages((current) => [
            ...current,
            {
              id: uid('msg'),
              role: 'assistant',
              content: response.reply,
              createdAt: nowIso(),
            },
          ])
          setError(null)
        } catch (caught) {
          setError(errorMessage(caught))
          setMessages((current) => [
            ...current,
            {
              id: uid('msg'),
              role: 'assistant',
              content: buildLocalReply(trimmed),
              createdAt: nowIso(),
            },
          ])
        } finally {
          setIsLoading(false)
        }
      },
      clearMessages() {
        setMessages(initialMessages)
      },
    }),
    [cloudConfigured, error, isLoading, messages, setMessages],
  )
}
