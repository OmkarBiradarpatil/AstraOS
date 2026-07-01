import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Circle, Clock3, ListFilter, Plus, Trash2 } from 'lucide-react'
import { ZodError } from 'zod'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextArea, TextInput } from '../../components/ui/Field'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import { formatShortDate } from '../../lib/date'
import type { TaskStatus } from '../../types/domain'
import { filterTasks, getTaskStats } from './taskUtils'
import { useTasks } from './useTasks'

const statusOptions: Array<TaskStatus | 'all'> = ['all', 'todo', 'doing', 'done']

export function TasksPage() {
  const { addTask, removeTask, tasks, updateStatus } = useTasks()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [error, setError] = useState('')
  const stats = getTaskStats(tasks)
  const visibleTasks = useMemo(() => filterTasks(tasks, query, status), [query, status, tasks])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')

    try {
      addTask({
        title: form.get('title'),
        notes: form.get('notes'),
        priority: form.get('priority'),
        dueDate: form.get('dueDate'),
        estimateMinutes: form.get('estimateMinutes'),
        tags: form.get('tags'),
      })
      event.currentTarget.reset()
    } catch (err) {
      setError(err instanceof ZodError ? err.issues[0]?.message ?? 'Invalid task' : 'Invalid task')
    }
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">Focus Engine</p>
        <h2>Keep the queue clear, prioritized, and ready for focused work.</h2>
        <p>
          Plan the next action, capture useful context, and filter the list without losing the wider
          day view.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Active" value={stats.active} sub="open tasks" tone="cyan" />
        <StatCard label="Completed" value={stats.completed} sub="done locally" tone="green" />
        <StatCard label="Focus load" value={`${stats.totalMinutes}m`} sub="remaining estimate" tone="amber" />
        <StatCard label="Completion" value={`${stats.completionRate}%`} sub="all tasks" tone="violet" />
      </div>

      <div className="two-column">
        <Card title="Create Task" eyebrow="Capture">
          <form className="stack" onSubmit={submit}>
            <Field label="Title">
              <TextInput name="title" placeholder="Ship dashboard migration" required />
            </Field>
            <Field label="Notes">
              <TextArea name="notes" placeholder="What does done look like?" rows={4} />
            </Field>
            <div className="form-grid">
              <Field label="Priority">
                <SelectInput name="priority" defaultValue="medium">
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </SelectInput>
              </Field>
              <Field label="Estimate">
                <TextInput name="estimateMinutes" type="number" min={5} max={720} defaultValue={25} />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Due date">
                <TextInput name="dueDate" type="date" />
              </Field>
              <Field label="Tags">
                <TextInput name="tags" placeholder="backend, audit" />
              </Field>
            </div>
            {error && <p className="form-error">{error}</p>}
            <Button variant="primary" type="submit">
              <Plus size={16} /> Add task
            </Button>
          </form>
        </Card>

        <Card
          title="Task Queue"
          eyebrow="Search and filter"
          action={
            <div className="inline-control">
              <ListFilter size={16} />
              <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="stack">
            <TextInput
              aria-label="Search tasks"
              placeholder="Search title, tag, priority..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ProgressBar label="Completion" value={stats.completionRate} />
            {visibleTasks.length === 0 ? (
              <EmptyState title="No tasks match" body="Adjust the filter or create a new task." />
            ) : (
              <div className="item-list">
                {visibleTasks.map((task) => (
                  <article className={`task-row priority-${task.priority}`} key={task.id}>
                    <button
                      aria-label={`${task.status === 'done' ? 'Reopen' : 'Complete'} ${task.title}`}
                      className="status-toggle"
                      type="button"
                      onClick={() => updateStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                    >
                      {task.status === 'done' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>
                    <div className="item-main">
                      <div className="item-title-line">
                        <h3>{task.title}</h3>
                        <span className={`pill ${task.priority}`}>{task.priority}</span>
                      </div>
                      <p>{task.notes || 'No notes yet.'}</p>
                      <div className="item-meta">
                        <span>
                          <Clock3 size={14} /> {task.estimateMinutes}m
                        </span>
                        {task.dueDate && <span>Due {formatShortDate(task.dueDate)}</span>}
                        {task.tags.map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="row-actions">
                      {task.status !== 'doing' && task.status !== 'done' && (
                        <Button onClick={() => updateStatus(task.id, 'doing')}>Start</Button>
                      )}
                      {task.status === 'doing' && (
                        <Button onClick={() => updateStatus(task.id, 'done')}>Complete</Button>
                      )}
                      <Button variant="ghost" onClick={() => removeTask(task.id)} aria-label={`Delete ${task.title}`}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
