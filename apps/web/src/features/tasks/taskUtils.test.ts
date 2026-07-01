import { describe, expect, it } from 'vitest'
import type { Task } from '../../types/domain'
import { filterTasks, getTaskStats, parseTags } from './taskUtils'

const baseTask: Task = {
  id: '1',
  title: 'Architecture audit',
  notes: 'Split monolith',
  status: 'todo',
  priority: 'high',
  tags: ['audit'],
  estimateMinutes: 30,
  dueDate: '2026-06-07',
  createdAt: '2026-06-07T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
}

describe('task utilities', () => {
  it('parses comma separated tags', () => {
    expect(parseTags(' #audit, backend, ,frontend ')).toEqual(['audit', 'backend', 'frontend'])
  })

  it('calculates task stats', () => {
    expect(getTaskStats([baseTask, { ...baseTask, id: '2', status: 'done' }])).toMatchObject({
      active: 1,
      completed: 1,
      completionRate: 50,
      totalMinutes: 30,
    })
  })

  it('filters by status and query', () => {
    const result = filterTasks([baseTask], 'mono', 'todo')
    expect(result).toHaveLength(1)
  })
})
