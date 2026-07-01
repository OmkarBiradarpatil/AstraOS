import type { FormEvent } from 'react'
import { Check, Clapperboard, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextInput } from '../../components/ui/Field'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import type { BucketItem } from '../../types/domain'
import { useEntertainment } from './useEntertainment'

export function EntertainmentPage() {
  const entertainment = useEntertainment()
  const watchedMinutes = entertainment.sessions.reduce((total, session) => total + session.minutes, 0)
  const completedBucket = entertainment.bucket.filter((item) => item.status === 'done').length

  function submitAnime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    entertainment.addAnime({
      title: String(form.get('title') || ''),
      totalEpisodes: Number(form.get('totalEpisodes') || 12),
      emoji: String(form.get('emoji') || ''),
    })
    event.currentTarget.reset()
  }

  function submitBucket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    entertainment.addBucketItem({
      title: String(form.get('title') || ''),
      category: form.get('category') as BucketItem['category'],
      priority: form.get('priority') as BucketItem['priority'],
    })
    event.currentTarget.reset()
  }

  function submitSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    entertainment.logWatchSession({
      title: String(form.get('title') || ''),
      minutes: Number(form.get('minutes') || 30),
    })
    event.currentTarget.reset()
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">Entertainment</p>
        <h2>Track shows, watch sessions, and the ideas you want to experience.</h2>
        <p>
          Keep leisure intentional with episode progress, time logs, and a curated bucket list.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Series" value={entertainment.anime.length} sub="tracked shows" tone="cyan" />
        <StatCard label="Watch time" value={`${watchedMinutes}m`} sub="logged sessions" tone="green" />
        <StatCard label="Bucket" value={entertainment.bucket.length} sub={`${completedBucket} done`} tone="amber" />
        <StatCard label="Today" value={entertainment.sessions.length} sub="logged sessions" tone="violet" />
      </div>

      <div className="three-column">
        <Card title="Add Series" eyebrow="Tracker">
          <form className="stack" onSubmit={submitAnime}>
            <Field label="Title">
              <TextInput name="title" placeholder="Series name" required />
            </Field>
            <div className="form-grid">
              <Field label="Episodes">
                <TextInput name="totalEpisodes" type="number" min={1} defaultValue={12} />
              </Field>
              <Field label="Badge">
                <TextInput name="emoji" placeholder="TV" maxLength={3} />
              </Field>
            </div>
            <Button variant="primary" type="submit">
              <Plus size={16} /> Add series
            </Button>
          </form>
        </Card>

        <Card title="Bucket Item" eyebrow="Life list">
          <form className="stack" onSubmit={submitBucket}>
            <Field label="Title">
              <TextInput name="title" placeholder="Watch a documentary" required />
            </Field>
            <div className="form-grid">
              <Field label="Category">
                <SelectInput name="category" defaultValue="watch">
                  <option value="watch">Watch</option>
                  <option value="read">Read</option>
                  <option value="visit">Visit</option>
                  <option value="learn">Learn</option>
                  <option value="other">Other</option>
                </SelectInput>
              </Field>
              <Field label="Priority">
                <SelectInput name="priority" defaultValue="medium">
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </SelectInput>
              </Field>
            </div>
            <Button variant="primary" type="submit">
              <Plus size={16} /> Add item
            </Button>
          </form>
        </Card>

        <Card title="Watch Session" eyebrow="Timebox">
          <form className="stack" onSubmit={submitSession}>
            <Field label="Title">
              <TextInput name="title" placeholder="Evening episode" required />
            </Field>
            <Field label="Minutes">
              <TextInput name="minutes" type="number" min={1} defaultValue={30} />
            </Field>
            <Button variant="primary" type="submit">
              <Clapperboard size={16} /> Log session
            </Button>
          </form>
        </Card>
      </div>

      <div className="two-column">
        <Card title="Episode Tracker" eyebrow="Progress">
          {entertainment.anime.length === 0 ? (
            <EmptyState title="No series yet" body="Add a series to track watched episodes." />
          ) : (
            <div className="item-list">
              {entertainment.anime.map((item) => {
                const completion = (item.watchedEpisodes.length / item.totalEpisodes) * 100
                return (
                  <article className="data-card vertical" key={item.id}>
                    <div className="item-title-line">
                      <div>
                        <h3>
                          <span className="badge-mark">{item.emoji}</span>
                          {item.title}
                        </h3>
                        <p>
                          {item.watchedEpisodes.length}/{item.totalEpisodes} watched
                        </p>
                      </div>
                      <span className="pill green">{Math.round(completion)}%</span>
                    </div>
                    <ProgressBar label="Progress" value={completion} />
                    <div className="episode-grid">
                      {Array.from({ length: item.totalEpisodes }, (_, index) => index + 1).map((episode) => (
                        <button
                          className={item.watchedEpisodes.includes(episode) ? 'episode watched' : 'episode'}
                          key={episode}
                          type="button"
                          onClick={() => entertainment.toggleEpisode(item.id, episode)}
                          aria-label={`Episode ${episode}`}
                        >
                          {episode}
                        </button>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Bucket List" eyebrow="Curated">
          {entertainment.bucket.length === 0 ? (
            <EmptyState title="No bucket items" body="Add books, shows, places, or learning ideas." />
          ) : (
            <div className="item-list">
              {entertainment.bucket.map((item) => (
                <article className="data-card" key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.category}</p>
                    <span className={`pill ${item.priority}`}>{item.priority}</span>
                  </div>
                  <Button
                    variant={item.status === 'done' ? 'primary' : 'secondary'}
                    onClick={() => entertainment.setBucketStatus(item.id, item.status === 'done' ? 'pending' : 'done')}
                  >
                    <Check size={16} /> {item.status === 'done' ? 'Done' : 'Mark done'}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
