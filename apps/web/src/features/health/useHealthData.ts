import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../lib/api/apiClient'
import { mergeRemoteWithLocal, restoreDeletedItem } from '../../lib/api/cloudMerge'
import { getAllCloudItems } from '../../lib/api/cloudPagination'
import {
  asNumber,
  asPlainObject,
  asString,
  cloudRecordId,
  isMongoId,
  isoString,
  type CloudRecord,
} from '../../lib/api/cloudRecords'
import { nowIso, todayIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import type { ScreenLog, SleepLog, WaterLog, WorkoutLog } from '../../types/domain'
import { calculateSleepHours, getSleepQuality } from './healthUtils'

interface SettingsResponse {
  settings?: CloudRecord | null
}

const workoutCategories = ['cardio', 'strength', 'mobility', 'sport', 'other'] as const
const workoutIntensities = ['low', 'medium', 'high'] as const

function toWaterLog(record: CloudRecord): WaterLog {
  const metrics = asPlainObject(record.metrics)
  return {
    id: cloudRecordId(record, uid('water')),
    amountMl: asNumber(metrics.amountMl, 0),
    date: asString(record.date, todayIso()),
    createdAt: isoString(record.createdAt),
  }
}

function toSleepLog(record: CloudRecord): SleepLog {
  const metrics = asPlainObject(record.metrics)
  const hours = asNumber(metrics.hours, 0)
  const quality = asString(metrics.quality)
  return {
    id: cloudRecordId(record, uid('sleep')),
    date: asString(record.date, todayIso()),
    sleepTime: asString(metrics.sleepTime, '23:00'),
    wakeTime: asString(metrics.wakeTime, '07:00'),
    hours,
    quality: ['poor', 'fair', 'good', 'excellent'].includes(quality)
      ? quality as SleepLog['quality']
      : getSleepQuality(hours),
    notes: asString(record.notes),
    createdAt: isoString(record.createdAt),
  }
}

function toWorkoutLog(record: CloudRecord): WorkoutLog {
  const metrics = asPlainObject(record.metrics)
  const category = asString(metrics.category)
  const intensity = asString(metrics.intensity)
  return {
    id: cloudRecordId(record, uid('workout')),
    date: asString(record.date, todayIso()),
    name: asString(metrics.name, 'Workout'),
    category: workoutCategories.includes(category as WorkoutLog['category'])
      ? category as WorkoutLog['category']
      : 'other',
    durationMinutes: asNumber(metrics.durationMinutes, 0),
    calories: asNumber(metrics.calories, 0),
    intensity: workoutIntensities.includes(intensity as WorkoutLog['intensity'])
      ? intensity as WorkoutLog['intensity']
      : 'medium',
    createdAt: isoString(record.createdAt),
  }
}

function toScreenLog(record: CloudRecord): ScreenLog {
  const metrics = asPlainObject(record.metrics)
  return {
    id: cloudRecordId(record, uid('screen')),
    date: asString(record.date, todayIso()),
    hours: asNumber(metrics.hours, 0),
    limitHours: asNumber(metrics.limitHours, 6),
    createdAt: isoString(record.createdAt),
  }
}

function healthLogPayload(type: CloudRecord['type'], date: string, metrics: Record<string, unknown>, notes = '') {
  return { type, date, metrics, notes }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Health cloud sync failed.'
}

export function useHealthData() {
  const [waterLogs, setWaterLogs] = usePersistentState<WaterLog[]>('astraos.health.water', [])
  const [sleepLogs, setSleepLogs] = usePersistentState<SleepLog[]>('astraos.health.sleep', [])
  const [workoutLogs, setWorkoutLogs] = usePersistentState<WorkoutLog[]>('astraos.health.workouts', [])
  const [screenLogs, setScreenLogs] = usePersistentState<ScreenLog[]>('astraos.health.screen', [])
  const [waterGoal, setWaterGoal] = usePersistentState<number>('astraos.health.waterGoal', 2500)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloudConfigured = apiClient.canUseProtectedApi()

  useEffect(() => {
    if (!cloudConfigured) return
    let cancelled = false

    async function loadHealthData() {
      setIsLoading(true)
      try {
        const [logResponse, settingsResponse] = await Promise.all([
          getAllCloudItems('/health-logs'),
          apiClient.get<SettingsResponse>('/settings'),
        ])
        if (cancelled) return
        const water = logResponse.filter((record) => record.type === 'water').map(toWaterLog)
        const sleep = logResponse.filter((record) => record.type === 'sleep').map(toSleepLog)
        const workouts = logResponse.filter((record) => record.type === 'workout').map(toWorkoutLog)
        const screen = logResponse.filter((record) => record.type === 'screen').map(toScreenLog)
        if (water.length) setWaterLogs((current) => mergeRemoteWithLocal(water, current))
        if (sleep.length) setSleepLogs((current) => mergeRemoteWithLocal(sleep, current))
        if (workouts.length) setWorkoutLogs((current) => mergeRemoteWithLocal(workouts, current))
        if (screen.length) setScreenLogs((current) => mergeRemoteWithLocal(screen, current))

        const preferences = asPlainObject(settingsResponse.settings?.preferences)
        const health = asPlainObject(preferences.health)
        const remoteWaterGoal = asNumber(health.waterGoal, 0)
        if (remoteWaterGoal > 0) setWaterGoal(remoteWaterGoal)
        setError(null)
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadHealthData()

    return () => {
      cancelled = true
    }
  }, [cloudConfigured, setScreenLogs, setSleepLogs, setWaterGoal, setWaterLogs, setWorkoutLogs])

  return useMemo(
    () => ({
      waterGoal,
      waterLogs,
      sleepLogs,
      workoutLogs,
      screenLogs,
      isLoading,
      error,
      isCloudBacked: cloudConfigured && !error,
      async setWaterGoal(goal: number) {
        const previous = waterGoal
        const next = Math.max(500, Math.round(goal))
        setWaterGoal(next)
        if (!cloudConfigured) return

        try {
          await apiClient.patch('/settings', { preferences: { health: { waterGoal: next } } })
          setError(null)
        } catch (caught) {
          setWaterGoal((current) => (current === next ? previous : current))
          setError(errorMessage(caught))
        }
      },
      async addWater(amountMl: number) {
        const water: WaterLog = { id: uid('water'), amountMl, date: todayIso(), createdAt: nowIso() }
        setWaterLogs((current) => [water, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>(
            '/health-logs',
            healthLogPayload('water', water.date, { amountMl: water.amountMl }),
            { headers: { 'x-idempotency-key': water.id } },
          )
          setWaterLogs((current) => current.map((log) => (log.id === water.id ? toWaterLog(created) : log)))
          setError(null)
        } catch (caught) {
          setWaterLogs((current) => current.filter((log) => log.id !== water.id))
          setError(errorMessage(caught))
        }
      },
      async resetWaterToday() {
        const today = todayIso()
        const removed = waterLogs.filter((log) => log.date === today)
        setWaterLogs((current) => current.filter((log) => log.date !== today))
        if (!cloudConfigured) return

        try {
          await Promise.all(removed.filter((log) => isMongoId(log.id)).map((log) => apiClient.delete(`/health-logs/${log.id}`)))
          setError(null)
        } catch (caught) {
          setWaterLogs((current) => removed.reduce((next, log) => restoreDeletedItem(log, next), current))
          setError(errorMessage(caught))
        }
      },
      async addSleep(input: { date: string; sleepTime: string; wakeTime: string; notes: string }) {
        const hours = calculateSleepHours(input.sleepTime, input.wakeTime)
        const sleep: SleepLog = {
          id: uid('sleep'),
          date: input.date,
          sleepTime: input.sleepTime,
          wakeTime: input.wakeTime,
          hours,
          quality: getSleepQuality(hours),
          notes: input.notes,
          createdAt: nowIso(),
        }
        setSleepLogs((current) => [sleep, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>(
            '/health-logs',
            healthLogPayload('sleep', sleep.date, {
              sleepTime: sleep.sleepTime,
              wakeTime: sleep.wakeTime,
              hours: sleep.hours,
              quality: sleep.quality,
            }, sleep.notes),
            { headers: { 'x-idempotency-key': sleep.id } },
          )
          setSleepLogs((current) => current.map((log) => (log.id === sleep.id ? toSleepLog(created) : log)))
          setError(null)
        } catch (caught) {
          setSleepLogs((current) => current.filter((log) => log.id !== sleep.id))
          setError(errorMessage(caught))
        }
      },
      async addWorkout(input: Omit<WorkoutLog, 'id' | 'createdAt'>) {
        const workout: WorkoutLog = { ...input, id: uid('workout'), createdAt: nowIso() }
        setWorkoutLogs((current) => [workout, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>(
            '/health-logs',
            healthLogPayload('workout', workout.date, {
              name: workout.name,
              category: workout.category,
              durationMinutes: workout.durationMinutes,
              calories: workout.calories,
              intensity: workout.intensity,
            }),
            { headers: { 'x-idempotency-key': workout.id } },
          )
          setWorkoutLogs((current) => current.map((log) => (log.id === workout.id ? toWorkoutLog(created) : log)))
          setError(null)
        } catch (caught) {
          setWorkoutLogs((current) => current.filter((log) => log.id !== workout.id))
          setError(errorMessage(caught))
        }
      },
      async addScreenLog(hours: number, limitHours: number) {
        const screen: ScreenLog = { id: uid('screen'), date: todayIso(), hours, limitHours, createdAt: nowIso() }
        setScreenLogs((current) => [screen, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>(
            '/health-logs',
            healthLogPayload('screen', screen.date, { hours: screen.hours, limitHours: screen.limitHours }),
            { headers: { 'x-idempotency-key': screen.id } },
          )
          setScreenLogs((current) => current.map((log) => (log.id === screen.id ? toScreenLog(created) : log)))
          setError(null)
        } catch (caught) {
          setScreenLogs((current) => current.filter((log) => log.id !== screen.id))
          setError(errorMessage(caught))
        }
      },
      async clearHealthData() {
        const removed = { waterLogs, sleepLogs, workoutLogs, screenLogs }
        setWaterLogs([])
        setSleepLogs([])
        setWorkoutLogs([])
        setScreenLogs([])
        if (!cloudConfigured) return

        try {
          const ids = [...waterLogs, ...sleepLogs, ...workoutLogs, ...screenLogs]
            .map((log) => log.id)
            .filter(isMongoId)
          await Promise.all(ids.map((id) => apiClient.delete(`/health-logs/${id}`)))
          setError(null)
        } catch (caught) {
          setWaterLogs((current) => removed.waterLogs.reduce((next, log) => restoreDeletedItem(log, next), current))
          setSleepLogs((current) => removed.sleepLogs.reduce((next, log) => restoreDeletedItem(log, next), current))
          setWorkoutLogs((current) => removed.workoutLogs.reduce((next, log) => restoreDeletedItem(log, next), current))
          setScreenLogs((current) => removed.screenLogs.reduce((next, log) => restoreDeletedItem(log, next), current))
          setError(errorMessage(caught))
        }
      },
    }),
    [
      cloudConfigured,
      error,
      isLoading,
      screenLogs,
      setScreenLogs,
      setSleepLogs,
      setWaterGoal,
      setWaterLogs,
      setWorkoutLogs,
      sleepLogs,
      waterGoal,
      waterLogs,
      workoutLogs,
    ],
  )
}
