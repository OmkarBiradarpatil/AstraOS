import type { FormEvent } from 'react'
import { Droplets, Moon, Smartphone, Trash2, Zap } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, SelectInput, TextInput } from '../../components/ui/Field'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import { todayIso } from '../../lib/date'
import { buildHealthTimeline, calculateEnergyScore } from './healthUtils'
import { useHealthData } from './useHealthData'

export function HealthPage() {
  const health = useHealthData()
  const score = calculateEnergyScore(health)
  const today = todayIso()
  const waterToday = health.waterLogs
    .filter((log) => log.date === today)
    .reduce((total, log) => total + log.amountMl, 0)
  const sleepLatest = health.sleepLogs[0]
  const workoutsToday = health.workoutLogs.filter((log) => log.date === today)
  const screenLatest = health.screenLogs[0]
  const timeline = buildHealthTimeline(health)

  function addWater(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount') || 0)
    const goal = Number(form.get('goal') || health.waterGoal)
    if (goal > 0) health.setWaterGoal(goal)
    if (amount > 0) health.addWater(amount)
    event.currentTarget.reset()
  }

  function addSleep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    health.addSleep({
      date: String(form.get('date') || today),
      sleepTime: String(form.get('sleepTime') || '23:00'),
      wakeTime: String(form.get('wakeTime') || '07:00'),
      notes: String(form.get('notes') || ''),
    })
    event.currentTarget.reset()
  }

  function addWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    health.addWorkout({
      date: today,
      name: String(form.get('name') || 'Workout'),
      category: form.get('category') as 'cardio' | 'strength' | 'mobility' | 'sport' | 'other',
      durationMinutes: Number(form.get('durationMinutes') || 0),
      calories: Number(form.get('calories') || 0),
      intensity: form.get('intensity') as 'low' | 'medium' | 'high',
    })
    event.currentTarget.reset()
  }

  function addScreen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const hours = Number(form.get('hours') || 0)
    const limit = Number(form.get('limit') || 6)
    health.addScreenLog(hours, limit)
    event.currentTarget.reset()
  }

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">Health</p>
        <h2>Track recovery, hydration, activity, and screen time without friction.</h2>
        <p>
          Small daily signals roll into a simple energy score so the workspace reflects how you are
          actually doing.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Energy" value={`${score.total}/100`} sub="composite score" tone="green" />
        <StatCard label="Hydration" value={`${waterToday}ml`} sub={`goal ${health.waterGoal}ml`} tone="cyan" />
        <StatCard label="Sleep" value={sleepLatest ? `${sleepLatest.hours}h` : '0h'} sub={sleepLatest?.quality ?? 'no log'} tone="violet" />
        <StatCard label="Activity" value={workoutsToday.length} sub="workouts today" tone="amber" />
      </div>

      <div className="two-column">
        <Card title="Daily Intake" eyebrow="Water">
          <form className="stack" onSubmit={addWater}>
            <div className="form-grid">
              <Field label="Amount ml">
                <TextInput name="amount" type="number" min={50} max={2000} placeholder="250" />
              </Field>
              <Field label="Goal ml">
                <TextInput name="goal" type="number" min={500} max={6000} defaultValue={health.waterGoal} />
              </Field>
            </div>
            <div className="button-row">
              <Button variant="primary" type="submit">
                <Droplets size={16} /> Add water
              </Button>
              <Button onClick={() => health.addWater(250)}>+250</Button>
              <Button onClick={() => health.addWater(500)}>+500</Button>
              <Button variant="ghost" onClick={health.resetWaterToday}>
                Reset
              </Button>
            </div>
          </form>
          <ProgressBar label="Hydration" value={(waterToday / health.waterGoal) * 100} />
        </Card>

        <Card title="Sleep Log" eyebrow="Recovery">
          <form className="stack" onSubmit={addSleep}>
            <div className="form-grid">
              <Field label="Sleep time">
                <TextInput name="sleepTime" type="time" defaultValue="23:00" />
              </Field>
              <Field label="Wake time">
                <TextInput name="wakeTime" type="time" defaultValue="07:00" />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Date">
                <TextInput name="date" type="date" defaultValue={today} />
              </Field>
              <Field label="Notes">
                <TextInput name="notes" placeholder="Restless, deep sleep..." />
              </Field>
            </div>
            <Button variant="primary" type="submit">
              <Moon size={16} /> Log sleep
            </Button>
          </form>
        </Card>
      </div>

      <div className="two-column">
        <Card title="Workout Tracker" eyebrow="Activity">
          <form className="stack" onSubmit={addWorkout}>
            <Field label="Workout">
              <TextInput name="name" placeholder="Morning run" required />
            </Field>
            <div className="form-grid">
              <Field label="Category">
                <SelectInput name="category" defaultValue="cardio">
                  <option value="cardio">Cardio</option>
                  <option value="strength">Strength</option>
                  <option value="mobility">Mobility</option>
                  <option value="sport">Sport</option>
                  <option value="other">Other</option>
                </SelectInput>
              </Field>
              <Field label="Intensity">
                <SelectInput name="intensity" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </SelectInput>
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Duration">
                <TextInput name="durationMinutes" type="number" min={1} placeholder="45" />
              </Field>
              <Field label="Calories">
                <TextInput name="calories" type="number" min={0} placeholder="320" />
              </Field>
            </div>
            <Button variant="primary" type="submit">
              <Zap size={16} /> Log workout
            </Button>
          </form>
        </Card>

        <Card title="Screen Time" eyebrow="Focus">
          <form className="stack" onSubmit={addScreen}>
            <div className="form-grid">
              <Field label="Hours today">
                <TextInput name="hours" type="number" min={0} max={24} step="0.25" placeholder="4.5" />
              </Field>
              <Field label="Daily limit">
                <TextInput name="limit" type="number" min={1} max={24} defaultValue={6} />
              </Field>
            </div>
            <Button variant="primary" type="submit">
              <Smartphone size={16} /> Log screen time
            </Button>
          </form>
          {screenLatest && (
            <ProgressBar label="Screen limit used" value={(screenLatest.hours / screenLatest.limitHours) * 100} />
          )}
        </Card>
      </div>

      <Card
        title="Health Timeline"
        eyebrow="Recent data"
        action={
          <Button variant="ghost" onClick={health.clearHealthData}>
            <Trash2 size={16} /> Clear
          </Button>
        }
      >
        {timeline.length === 0 ? (
          <EmptyState title="No health data yet" body="Add water, sleep, workout, or screen logs to generate insights." />
        ) : (
          <div className="item-list compact">
            {timeline.map((item) => (
              <article className="data-row" key={`${item.kind}-${item.id}`}>
                <span>{item.label}</span>
                <strong>{item.detail}</strong>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
