import { useState } from 'react'
import type { FormEvent } from 'react'
import { Clock3, MonitorPlay, Plus, StickyNote, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, TextInput } from '../../components/ui/Field'
import { StatCard } from '../../components/ui/StatCard'
import { getEmbedUrl, getFocusMinutes } from './focusUtils'
import { useFocusTube } from './useFocusTube'

export function FocusTubePage() {
  const { addNote, createSession, removeSession, sessions } = useFocusTube()
  const [error, setError] = useState('')
  const latest = sessions[0]

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')

    try {
      createSession({
        title: String(form.get('title') || ''),
        video: String(form.get('video') || ''),
        minutesFocused: Number(form.get('minutesFocused') || 25),
      })
      event.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create focus session.')
    }
  }

  function submitNote(event: FormEvent<HTMLFormElement>, sessionId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    addNote(sessionId, {
      text: String(form.get('text') || ''),
      timestamp: String(form.get('timestamp') || ''),
    })
    event.currentTarget.reset()
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">FocusTube</p>
        <h2>Turn useful videos into structured focus sessions with timed notes.</h2>
        <p>
          Save a focused watch session, track minutes, and attach the moments worth returning to.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Sessions" value={sessions.length} sub="saved locally" tone="cyan" />
        <StatCard label="Focus time" value={`${getFocusMinutes(sessions)}m`} sub="tracked minutes" tone="green" />
        <StatCard
          label="Notes"
          value={sessions.reduce((total, session) => total + session.notes.length, 0)}
          sub="session annotations"
          tone="amber"
        />
        <StatCard label="Player" value={latest ? 'Ready' : 'Empty'} sub="privacy embed" tone="violet" />
      </div>

      <div className="two-column">
        <Card title="Start Session" eyebrow="YouTube">
          <form className="stack" onSubmit={submitSession}>
            <Field label="Title">
              <TextInput name="title" placeholder="Deep work playlist" required />
            </Field>
            <Field label="Video URL or ID">
              <TextInput name="video" placeholder="https://www.youtube.com/watch?v=..." required />
            </Field>
            <Field label="Planned minutes">
              <TextInput name="minutesFocused" type="number" min={1} max={600} defaultValue={25} />
            </Field>
            {error && <p className="form-error">{error}</p>}
            <Button variant="primary" type="submit">
              <Plus size={16} /> Create session
            </Button>
          </form>
        </Card>

        <Card title="Current Player" eyebrow="Focused viewing">
          {latest ? (
            <div className="media-panel">
              <iframe
                title={latest.title}
                src={getEmbedUrl(latest.videoId)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <div className="media-caption">
                <MonitorPlay size={18} />
                <span>{latest.title}</span>
              </div>
            </div>
          ) : (
            <EmptyState title="No session yet" body="Add a YouTube URL to create the first focus session." />
          )}
        </Card>
      </div>

      <Card title="Focus Sessions" eyebrow="Timeline">
        {sessions.length === 0 ? (
          <EmptyState title="No sessions saved" body="Create a session to start capturing notes." />
        ) : (
          <div className="item-list">
            {sessions.map((session) => (
              <article className="data-card vertical" key={session.id}>
                <div className="item-title-line">
                  <div>
                    <h3>{session.title}</h3>
                    <p>
                      <Clock3 size={14} /> {session.minutesFocused} focused minutes
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => removeSession(session.id)} aria-label={`Delete ${session.title}`}>
                    <Trash2 size={16} />
                  </Button>
                </div>

                <form className="inline-form" onSubmit={(event) => submitNote(event, session.id)}>
                  <TextInput name="timestamp" placeholder="08:30" aria-label="Timestamp" />
                  <TextInput name="text" placeholder="Capture a note from this moment" aria-label="Focus note" />
                  <Button type="submit">
                    <StickyNote size={16} /> Note
                  </Button>
                </form>

                {session.notes.length > 0 && (
                  <div className="note-list">
                    {session.notes.map((note) => (
                      <p key={note.id}>
                        <strong>{note.timestamp}</strong>
                        {note.text}
                      </p>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
