import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../lib/api/apiClient'
import { mergeRemoteWithLocal, restoreDeletedItem } from '../../lib/api/cloudMerge'
import { getAllCloudItems } from '../../lib/api/cloudPagination'
import {
  asString,
  cloudRecordId,
  dateOnly,
  isMongoId,
  isoString,
  type CloudRecord,
} from '../../lib/api/cloudRecords'
import { nowIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import { bookmarkInputSchema, deadlineInputSchema } from '../../lib/validation/schemas'
import type { Bookmark, Deadline, ManualReminder } from '../../types/domain'

const initialDeadlines: Deadline[] = []

const initialBookmarks: Bookmark[] = []

const remindBeforeValues = ['1h', '3h', '6h', '12h', '1d', '2d', '3d'] as const

function toDeadline(record: CloudRecord): Deadline {
  return {
    id: cloudRecordId(record, uid('deadline')),
    title: asString(record.title, 'Untitled deadline'),
    dueDate: dateOnly(record.dueDate),
    dueTime: asString(record.dueTime, '23:59'),
    category: asString(record.category, 'General'),
    description: asString(record.description),
    reminderEmail: asString(record.reminderEmail),
    remindBefore: remindBeforeValues.includes(asString(record.remindBefore) as Deadline['remindBefore'])
      ? asString(record.remindBefore) as Deadline['remindBefore']
      : '1d',
    createdAt: isoString(record.createdAt),
  }
}

function toDeadlinePayload(deadline: Deadline) {
  return {
    title: deadline.title,
    description: deadline.description,
    category: deadline.category,
    dueDate: deadline.dueDate,
    dueTime: deadline.dueTime,
    reminderEmail: deadline.reminderEmail,
    remindBefore: deadline.remindBefore,
  }
}

function toBookmark(record: CloudRecord): Bookmark {
  return {
    id: cloudRecordId(record, uid('bookmark')),
    title: asString(record.title, 'Untitled bookmark'),
    url: asString(record.url, 'https://example.com'),
    category: asString(record.category, 'Reference'),
    description: asString(record.description),
    createdAt: isoString(record.createdAt),
  }
}

function toBookmarkPayload(bookmark: Bookmark) {
  return {
    title: bookmark.title,
    url: bookmark.url,
    category: bookmark.category,
    description: bookmark.description,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Dashboard cloud sync failed.'
}

export function useDashboardData() {
  const [deadlines, setDeadlines] = usePersistentState<Deadline[]>(
    'astraos.deadlines',
    initialDeadlines,
  )
  const [bookmarks, setBookmarks] = usePersistentState<Bookmark[]>(
    'astraos.bookmarks',
    initialBookmarks,
  )
  const [manualReminders, setManualReminders] = usePersistentState<ManualReminder[]>(
    'astraos.manualReminders',
    [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloudConfigured = apiClient.canUseProtectedApi()

  useEffect(() => {
    if (!cloudConfigured) return
    let cancelled = false

    async function loadDashboardData() {
      setIsLoading(true)
      try {
        const [deadlineResponse, bookmarkResponse] = await Promise.all([
          getAllCloudItems('/deadlines'),
          getAllCloudItems('/bookmarks'),
        ])
        if (cancelled) return
        if (deadlineResponse.length) {
          const remoteDeadlines = deadlineResponse.map(toDeadline)
          setDeadlines((current) => mergeRemoteWithLocal(remoteDeadlines, current))
        }
        if (bookmarkResponse.length) {
          const remoteBookmarks = bookmarkResponse.map(toBookmark)
          setBookmarks((current) => mergeRemoteWithLocal(remoteBookmarks, current))
        }
        setError(null)
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadDashboardData()

    return () => {
      cancelled = true
    }
  }, [cloudConfigured, setBookmarks, setDeadlines])

  return useMemo(
    () => ({
      deadlines,
      bookmarks,
      manualReminders,
      isLoading,
      error,
      isCloudBacked: cloudConfigured && !error,
      async addDeadline(input: unknown) {
        const parsed = deadlineInputSchema.parse(input)
        const deadline: Deadline = {
          id: uid('deadline'),
          title: parsed.title,
          dueDate: parsed.dueDate,
          dueTime: parsed.dueTime,
          category: parsed.category || 'General',
          description: parsed.description,
          reminderEmail: parsed.reminderEmail,
          remindBefore: parsed.remindBefore,
          createdAt: nowIso(),
        }
        setDeadlines((current) => [deadline, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/deadlines', toDeadlinePayload(deadline), {
            headers: { 'x-idempotency-key': deadline.id },
          })
          setDeadlines((current) => current.map((item) => (item.id === deadline.id ? toDeadline(created) : item)))
          setError(null)
        } catch (caught) {
          setDeadlines((current) => current.filter((item) => item.id !== deadline.id))
          setError(errorMessage(caught))
        }
      },
      async removeDeadline(id: string) {
        const previous = deadlines
        setDeadlines((current) => current.filter((deadline) => deadline.id !== id))
        if (!cloudConfigured || !isMongoId(id)) return

        try {
          await apiClient.delete(`/deadlines/${id}`)
          setError(null)
        } catch (caught) {
          const deleted = previous.find((deadline) => deadline.id === id)
          if (deleted) setDeadlines((current) => restoreDeletedItem(deleted, current))
          setError(errorMessage(caught))
        }
      },
      async addBookmark(input: unknown) {
        const parsed = bookmarkInputSchema.parse(input)
        const url = /^https?:\/\//i.test(parsed.url) ? parsed.url : `https://${parsed.url}`
        const bookmark: Bookmark = {
          id: uid('bookmark'),
          title: parsed.title,
          url,
          category: parsed.category,
          description: parsed.description,
          createdAt: nowIso(),
        }
        setBookmarks((current) => [bookmark, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/bookmarks', toBookmarkPayload(bookmark), {
            headers: { 'x-idempotency-key': bookmark.id },
          })
          setBookmarks((current) => current.map((item) => (item.id === bookmark.id ? toBookmark(created) : item)))
          setError(null)
        } catch (caught) {
          setBookmarks((current) => current.filter((item) => item.id !== bookmark.id))
          setError(errorMessage(caught))
        }
      },
      async removeBookmark(id: string) {
        const previous = bookmarks
        setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))
        if (!cloudConfigured || !isMongoId(id)) return

        try {
          await apiClient.delete(`/bookmarks/${id}`)
          setError(null)
        } catch (caught) {
          const deleted = previous.find((bookmark) => bookmark.id === id)
          if (deleted) setBookmarks((current) => restoreDeletedItem(deleted, current))
          setError(errorMessage(caught))
        }
      },
      addReminder(input: Omit<ManualReminder, 'id' | 'createdAt'>) {
        setManualReminders((current) => [{ ...input, id: uid('reminder'), createdAt: nowIso() }, ...current])
      },
      removeReminder(id: string) {
        setManualReminders((current) => current.filter((reminder) => reminder.id !== id))
      },
    }),
    [
      bookmarks,
      cloudConfigured,
      deadlines,
      error,
      isLoading,
      manualReminders,
      setBookmarks,
      setDeadlines,
      setManualReminders,
    ],
  )
}
