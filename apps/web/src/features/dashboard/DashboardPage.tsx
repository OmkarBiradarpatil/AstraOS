import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  BellRing,
  CalendarClock,
  ExternalLink,
  Gauge,
  Plus,
  RadioTower,
  Trash2,
} from 'lucide-react'
import { ZodError } from 'zod'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextArea, TextInput } from '../../components/ui/Field'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import { daysUntil, formatShortDate, todayIso } from '../../lib/date'
import { readLegacyStorage } from '../../lib/storage/legacyImport'
import { useCloudReadiness } from '../auth/cloudReadiness'
import { getTaskStats } from '../tasks/taskUtils'
import { useTasks } from '../tasks/useTasks'
import { useDashboardData } from './useDashboardData'

export function DashboardPage() {
  const {
    addBookmark,
    addDeadline,
    bookmarks,
    deadlines,
    manualReminders,
    removeBookmark,
    removeDeadline,
  } = useDashboardData()
  const { tasks } = useTasks()
  const [deadlineError, setDeadlineError] = useState('')
  const [bookmarkError, setBookmarkError] = useState('')
  const taskStats = getTaskStats(tasks)
  const legacySnapshot = readLegacyStorage()
  const cloud = useCloudReadiness()

  const deadlineStats = useMemo(() => {
    const today = todayIso()
    const overdue = deadlines.filter((deadline) => deadline.dueDate < today).length
    const dueSoon = deadlines.filter((deadline) => {
      const days = daysUntil(deadline.dueDate)
      return days >= 0 && days <= 3
    }).length
    return { overdue, dueSoon, total: deadlines.length }
  }, [deadlines])

  function submitDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setDeadlineError('')
    try {
      addDeadline({
        title: form.get('title'),
        dueDate: form.get('dueDate'),
        dueTime: form.get('dueTime'),
        category: form.get('category'),
        description: form.get('description'),
        reminderEmail: form.get('reminderEmail'),
        remindBefore: form.get('remindBefore'),
      })
      event.currentTarget.reset()
    } catch (err) {
      setDeadlineError(
        err instanceof ZodError ? err.issues[0]?.message ?? 'Invalid deadline' : 'Invalid deadline',
      )
    }
  }

  function submitBookmark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBookmarkError('')
    try {
      addBookmark({
        title: form.get('title'),
        url: form.get('url'),
        category: form.get('category'),
        description: form.get('description'),
      })
      event.currentTarget.reset()
    } catch (err) {
      setBookmarkError(
        err instanceof ZodError ? err.issues[0]?.message ?? 'Invalid bookmark' : 'Invalid bookmark',
      )
    }
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">Daily command center</p>
        <h2>Plan the day across tasks, deadlines, focus, health, and reference links.</h2>
        <p>
          AstraOS keeps the most important next actions visible so work feels organized without
          feeling crowded.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Tasks" value={taskStats.active} sub={`${taskStats.completed} completed`} tone="cyan" />
        <StatCard label="Deadlines" value={deadlineStats.total} sub={`${deadlineStats.dueSoon} due soon`} tone="amber" />
        <StatCard label="Bookmarks" value={bookmarks.length} sub="quick links" tone="green" />
        <StatCard
          label="Sync"
          value={cloud.label}
          sub={cloud.detail}
          tone={cloud.tone}
        />
      </div>

      <div className="two-column">
        <Card title="Operational Briefing" eyebrow="Today">
          <div className="briefing-list">
            <div>
              <Gauge size={18} />
              <span>Focus completion is {taskStats.completionRate}% across active task data.</span>
            </div>
            <div>
              <CalendarClock size={18} />
              <span>
                {deadlineStats.overdue
                  ? `${deadlineStats.overdue} deadline(s) overdue`
                  : 'No overdue deadlines in local state'}
              </span>
            </div>
            <div>
              <RadioTower size={18} />
              <span>
                {cloud.ready
                  ? 'Cloud sync is connected for this workspace.'
                  : cloud.apiConfigured
                    ? 'Cloud API is configured; sign in with Clerk to enable protected sync.'
                  : 'Workspace data is stored locally on this device.'}
              </span>
            </div>
            <div>
              <BellRing size={18} />
              <span>{manualReminders.length} manual reminder(s) stored locally.</span>
            </div>
          </div>
          <ProgressBar label="Task completion" value={taskStats.completionRate} />
        </Card>

        <Card title="Previous Workspace Data" eyebrow="Migration">
          {legacySnapshot.length ? (
            <div className="item-list compact">
              {legacySnapshot.slice(0, 6).map((item) => (
                <article className="data-row" key={item.key}>
                  <span>{item.key}</span>
                  <strong>{(item.byteLength / 1024).toFixed(1)} KB</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No legacy localStorage detected"
              body="This browser has no earlier AstraOS workspace data to bring forward."
            />
          )}
        </Card>
      </div>

      <div className="two-column">
        <Card title="Deadlines" eyebrow="Schedule">
          <form className="stack" onSubmit={submitDeadline}>
            <Field label="Title">
              <TextInput name="title" placeholder="Final release report" required />
            </Field>
            <div className="form-grid">
              <Field label="Date">
                <TextInput name="dueDate" type="date" required />
              </Field>
              <Field label="Time">
                <TextInput name="dueTime" type="time" defaultValue="23:59" />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Category">
                <TextInput name="category" placeholder="Release" />
              </Field>
              <Field label="Remind before">
                <SelectInput name="remindBefore" defaultValue="1d">
                  <option value="1h">1 hour</option>
                  <option value="3h">3 hours</option>
                  <option value="6h">6 hours</option>
                  <option value="12h">12 hours</option>
                  <option value="1d">1 day</option>
                  <option value="2d">2 days</option>
                  <option value="3d">3 days</option>
                </SelectInput>
              </Field>
            </div>
            <Field label="Reminder email" hint="Email reminders activate after cloud sync is connected.">
              <TextInput name="reminderEmail" type="email" placeholder="you@example.com" />
            </Field>
            <Field label="Description">
              <TextArea name="description" rows={3} />
            </Field>
            {deadlineError && <p className="form-error">{deadlineError}</p>}
            <Button variant="primary" type="submit">
              <Plus size={16} /> Add deadline
            </Button>
          </form>

          <div className="item-list">
            {deadlines.map((deadline) => (
              <article className="data-card" key={deadline.id}>
                <div>
                  <h3>{deadline.title}</h3>
                  <p>{deadline.description || deadline.category}</p>
                  <span>
                    {formatShortDate(deadline.dueDate)} at {deadline.dueTime}
                  </span>
                </div>
                <Button
                  aria-label={`Delete deadline ${deadline.title}`}
                  variant="ghost"
                  onClick={() => removeDeadline(deadline.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </article>
            ))}
          </div>
        </Card>

        <Card title="Bookmarks" eyebrow="Reference links">
          <form className="stack" onSubmit={submitBookmark}>
            <Field label="Title">
              <TextInput name="title" placeholder="Design system reference" required />
            </Field>
            <Field label="URL">
              <TextInput name="url" placeholder="https://example.com" required />
            </Field>
            <div className="form-grid">
              <Field label="Category">
                <TextInput name="category" defaultValue="Reference" />
              </Field>
              <Field label="Description">
                <TextInput name="description" />
              </Field>
            </div>
            {bookmarkError && <p className="form-error">{bookmarkError}</p>}
            <Button variant="primary" type="submit">
              <Plus size={16} /> Save bookmark
            </Button>
          </form>

          <div className="item-list">
            {bookmarks.map((bookmark) => (
              <article className="data-card" key={bookmark.id}>
                <div>
                  <h3>{bookmark.title}</h3>
                  <p>{bookmark.description || bookmark.category}</p>
                  <a href={bookmark.url} target="_blank" rel="noreferrer">
                    Open <ExternalLink size={14} />
                  </a>
                </div>
                <Button
                  aria-label={`Delete bookmark ${bookmark.title}`}
                  variant="ghost"
                  onClick={() => removeBookmark(bookmark.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
