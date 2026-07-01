import type { Priority, Task, TaskStatus } from '../../types/domain'

export const priorityRank: Record<Priority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 8)
}

export function getTaskStats(tasks: Task[]) {
  const completed = tasks.filter((task) => task.status === 'done').length
  const active = tasks.filter((task) => task.status !== 'done').length
  const totalMinutes = tasks
    .filter((task) => task.status !== 'done')
    .reduce((total, task) => total + task.estimateMinutes, 0)

  return {
    active,
    completed,
    completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    totalMinutes,
  }
}

export function filterTasks(tasks: Task[], query: string, status: TaskStatus | 'all') {
  const normalized = query.trim().toLowerCase()

  return tasks
    .filter((task) => status === 'all' || task.status === status)
    .filter((task) => {
      if (!normalized) return true
      return [task.title, task.notes, task.priority, task.status, ...task.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    })
    .sort((a, b) => {
      const priorityDelta = priorityRank[b.priority] - priorityRank[a.priority]
      if (priorityDelta) return priorityDelta
      return a.dueDate.localeCompare(b.dueDate)
    })
}
