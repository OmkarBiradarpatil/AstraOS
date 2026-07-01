import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../lib/api/apiClient'
import { mergeRemoteWithLocal, restoreDeletedItem } from '../../lib/api/cloudMerge'
import { getAllCloudItems } from '../../lib/api/cloudPagination'
import {
  asString,
  asStringArray,
  cloudRecordId,
  dateOnly,
  isMongoId,
  isoString,
  type CloudRecord,
} from '../../lib/api/cloudRecords'
import { nowIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import { taskInputSchema } from '../../lib/validation/schemas'
import type { Priority, Task, TaskStatus } from '../../types/domain'
import { parseTags } from './taskUtils'

const initialTasks: Task[] = []

function toTask(record: CloudRecord): Task {
  const createdAt = isoString(record.createdAt)
  return {
    id: cloudRecordId(record, uid('task')),
    title: asString(record.title, 'Untitled task'),
    notes: asString(record.notes),
    status: ['todo', 'doing', 'done'].includes(asString(record.status))
      ? asString(record.status) as TaskStatus
      : 'todo',
    priority: ['low', 'medium', 'high', 'critical'].includes(asString(record.priority))
      ? asString(record.priority) as Priority
      : 'medium',
    tags: asStringArray(record.tags),
    estimateMinutes: typeof record.estimateMinutes === 'number' ? record.estimateMinutes : 25,
    dueDate: dateOnly(record.dueDate),
    createdAt,
    updatedAt: isoString(record.updatedAt, createdAt),
  }
}

function toTaskPayload(task: Task) {
  return {
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    estimateMinutes: task.estimateMinutes,
    dueDate: task.dueDate || null,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Task cloud sync failed.'
}

export function useTasks() {
  const [tasks, setTasks, resetTasks] = usePersistentState<Task[]>('astraos.tasks', initialTasks)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloudConfigured = apiClient.canUseProtectedApi()

  useEffect(() => {
    if (!cloudConfigured) return
    let cancelled = false

    async function loadTasks() {
      setIsLoading(true)
      try {
        const items = await getAllCloudItems('/tasks')
        if (cancelled) return
        if (items.length) {
          const remoteTasks = items.map(toTask)
          setTasks((current) => mergeRemoteWithLocal(remoteTasks, current))
        }
        setError(null)
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadTasks()
    return () => {
      cancelled = true
    }
  }, [cloudConfigured, setTasks])

  return useMemo(
    () => ({
      tasks,
      isLoading,
      error,
      isCloudBacked: cloudConfigured && !error,
      async addTask(input: unknown) {
        const parsed = taskInputSchema.parse(input)
        const createdAt = nowIso()
        const task: Task = {
          id: uid('task'),
          title: parsed.title,
          notes: parsed.notes,
          priority: parsed.priority as Priority,
          tags: parseTags(parsed.tags),
          estimateMinutes: parsed.estimateMinutes,
          dueDate: parsed.dueDate,
          status: 'todo',
          createdAt,
          updatedAt: createdAt,
        }
        setTasks((current) => [task, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/tasks', toTaskPayload(task), {
            headers: { 'x-idempotency-key': task.id },
          })
          setTasks((current) => current.map((item) => (item.id === task.id ? toTask(created) : item)))
          setError(null)
        } catch (caught) {
          setTasks((current) => current.filter((item) => item.id !== task.id))
          setError(errorMessage(caught))
        }
      },
      async updateStatus(id: string, status: TaskStatus) {
        const previous = tasks.find((task) => task.id === id)
        if (!previous) return
        const next = { ...previous, status, updatedAt: nowIso() }
        setTasks((current) =>
          current.map((task) => (task.id === id ? { ...task, status, updatedAt: nowIso() } : task)),
        )
        if (!cloudConfigured) return

        try {
          const saved = isMongoId(id)
            ? await apiClient.patch<CloudRecord>(`/tasks/${id}`, toTaskPayload(next))
            : await apiClient.post<CloudRecord>('/tasks', toTaskPayload(next), {
              headers: { 'x-idempotency-key': id },
            })
          setTasks((current) => current.map((task) => (task.id === id ? toTask(saved) : task)))
          setError(null)
        } catch (caught) {
          setTasks((current) => current.map((task) => (task.id === id ? previous : task)))
          setError(errorMessage(caught))
        }
      },
      async removeTask(id: string) {
        const previous = tasks
        setTasks((current) => current.filter((task) => task.id !== id))
        if (!cloudConfigured || !isMongoId(id)) return

        try {
          await apiClient.delete(`/tasks/${id}`)
          setError(null)
        } catch (caught) {
          const deleted = previous.find((task) => task.id === id)
          if (deleted) setTasks((current) => restoreDeletedItem(deleted, current))
          setError(errorMessage(caught))
        }
      },
      resetTasks,
    }),
    [cloudConfigured, error, isLoading, resetTasks, setTasks, tasks],
  )
}
