import type { ScreenLog, SleepLog, WaterLog, WorkoutLog } from '../../types/domain'
import { todayIso } from '../../lib/date'

interface HealthTimelineInput {
  waterLogs: WaterLog[]
  sleepLogs: SleepLog[]
  workoutLogs: WorkoutLog[]
  screenLogs: ScreenLog[]
}

export interface HealthTimelineItem {
  id: string
  kind: 'water' | 'sleep' | 'workout' | 'screen'
  label: string
  detail: string
  createdAt: string
}

export function calculateSleepHours(sleepTime: string, wakeTime: string) {
  const [sleepHour, sleepMinute] = sleepTime.split(':').map(Number)
  const [wakeHour, wakeMinute] = wakeTime.split(':').map(Number)
  const sleep = sleepHour + sleepMinute / 60
  let wake = wakeHour + wakeMinute / 60
  if (wake <= sleep) wake += 24
  return Math.round((wake - sleep) * 10) / 10
}

export function getSleepQuality(hours: number): SleepLog['quality'] {
  if (hours >= 8) return 'excellent'
  if (hours >= 7) return 'good'
  if (hours >= 6) return 'fair'
  return 'poor'
}

export function calculateEnergyScore(input: {
  waterLogs: WaterLog[]
  sleepLogs: SleepLog[]
  workoutLogs: WorkoutLog[]
  screenLogs: ScreenLog[]
  waterGoal: number
}) {
  const today = todayIso()
  const waterToday = input.waterLogs
    .filter((log) => log.date === today)
    .reduce((total, log) => total + log.amountMl, 0)
  const latestSleep = input.sleepLogs[0]
  const workoutsToday = input.workoutLogs.filter((log) => log.date === today)
  const screenToday = input.screenLogs.find((log) => log.date === today)

  const hydration = Math.min(30, Math.round((waterToday / Math.max(input.waterGoal, 1)) * 30))
  const sleep = latestSleep ? Math.min(30, Math.round((latestSleep.hours / 8) * 30)) : 0
  const activity = Math.min(25, workoutsToday.length * 12 + (workoutsToday[0]?.durationMinutes ?? 0) / 6)
  const focus = screenToday ? Math.max(0, 15 - Math.max(0, screenToday.hours - screenToday.limitHours) * 5) : 10
  const total = Math.round(hydration + sleep + activity + focus)

  return {
    activity: Math.round(activity),
    focus: Math.round(focus),
    hydration,
    sleep,
    total,
  }
}

export function buildHealthTimeline(input: HealthTimelineInput, limit = 8): HealthTimelineItem[] {
  return [
    ...input.waterLogs.map((log) => ({
      id: log.id,
      kind: 'water' as const,
      label: `Water ${log.date}`,
      detail: `${log.amountMl}ml`,
      createdAt: log.createdAt,
    })),
    ...input.sleepLogs.map((log) => ({
      id: log.id,
      kind: 'sleep' as const,
      label: `Sleep ${log.date}`,
      detail: `${log.hours}h, ${log.quality}`,
      createdAt: log.createdAt,
    })),
    ...input.workoutLogs.map((log) => ({
      id: log.id,
      kind: 'workout' as const,
      label: log.name,
      detail: `${log.durationMinutes}m`,
      createdAt: log.createdAt,
    })),
    ...input.screenLogs.map((log) => ({
      id: log.id,
      kind: 'screen' as const,
      label: `Screen time ${log.date}`,
      detail: `${log.hours}h / ${log.limitHours}h limit`,
      createdAt: log.createdAt,
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
}
