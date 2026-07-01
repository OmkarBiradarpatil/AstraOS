import { describe, expect, it } from 'vitest'
import { buildHealthTimeline, calculateEnergyScore, calculateSleepHours, getSleepQuality } from './healthUtils'

describe('health utilities', () => {
  it('calculates overnight sleep windows', () => {
    expect(calculateSleepHours('23:00', '07:30')).toBe(8.5)
  })

  it('grades sleep quality', () => {
    expect(getSleepQuality(8)).toBe('excellent')
    expect(getSleepQuality(6.5)).toBe('fair')
  })

  it('renders all health signal types in the timeline', () => {
    const timeline = buildHealthTimeline({
      waterLogs: [{ id: 'w1', amountMl: 250, date: '2026-06-08', createdAt: '2026-06-08T08:00:00.000Z' }],
      sleepLogs: [{ id: 's1', date: '2026-06-08', sleepTime: '23:00', wakeTime: '07:00', hours: 8, quality: 'excellent', notes: '', createdAt: '2026-06-08T07:00:00.000Z' }],
      workoutLogs: [{ id: 'x1', date: '2026-06-08', name: 'Run', category: 'cardio', durationMinutes: 25, calories: 180, intensity: 'medium', createdAt: '2026-06-08T09:00:00.000Z' }],
      screenLogs: [{ id: 'c1', date: '2026-06-08', hours: 4, limitHours: 6, createdAt: '2026-06-08T10:00:00.000Z' }],
    })

    expect(timeline.map((item) => item.kind)).toEqual(['screen', 'workout', 'water', 'sleep'])
    expect(timeline.map((item) => item.label)).toEqual([
      'Screen time 2026-06-08',
      'Run',
      'Water 2026-06-08',
      'Sleep 2026-06-08',
    ])
  })

  it('uses today-matched screen logs for the energy score', () => {
    const score = calculateEnergyScore({
      waterGoal: 1000,
      waterLogs: [],
      sleepLogs: [],
      workoutLogs: [],
      screenLogs: [
        { id: 'old', date: '1999-01-01', hours: 24, limitHours: 1, createdAt: '1999-01-01T00:00:00.000Z' },
      ],
    })

    expect(score.focus).toBe(10)
  })
})
