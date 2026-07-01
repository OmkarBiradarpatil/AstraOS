import { apiClient } from '../lib/api/apiClient'
import { getAllCloudDocuments, getAllCloudItems } from '../lib/api/cloudPagination'
import {
  asNumber,
  asNumberArray,
  asPlainObject,
  asString,
  cloudRecordId,
  dateOnly,
  isoString,
  type CloudRecord,
} from '../lib/api/cloudRecords'

interface LegacyHydrationResult {
  configured: boolean
  synced: boolean
  keys: string[]
  errors: string[]
}

interface SettingsResponse {
  settings?: CloudRecord | null
}

function writeJson(storage: Storage, key: string, value: unknown, keys: string[]) {
  storage.setItem(key, JSON.stringify(value))
  keys.push(key)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Cloud hydration failed.'
}

function mapDeadline(record: CloudRecord) {
  return {
    id: cloudRecordId(record, asString(record.id, 'deadline')),
    title: asString(record.title, 'Untitled deadline'),
    dueDate: dateOnly(record.dueDate),
    dueTime: asString(record.dueTime, '23:59'),
    category: asString(record.category, 'General'),
    description: asString(record.description),
    reminderEmail: asString(record.reminderEmail),
    remindBefore: asString(record.remindBefore, '1d'),
    createdAt: isoString(record.createdAt),
  }
}

function mapBookmark(record: CloudRecord) {
  return {
    id: cloudRecordId(record, asString(record.id, 'bookmark')),
    title: asString(record.title, 'Untitled bookmark'),
    url: asString(record.url, 'https://example.com'),
    category: asString(record.category, 'Reference'),
    description: asString(record.description),
    createdAt: isoString(record.createdAt),
  }
}

function mapHealth(storage: Storage, records: CloudRecord[], keys: string[]) {
  const today = new Date().toISOString().slice(0, 10)
  const waterRecords = records.filter((record) => record.type === 'water')
  const waterByDate = new Map<string, number>()
  waterRecords.forEach((record) => {
    const metrics = asPlainObject(record.metrics)
    const date = asString(record.date, today)
    waterByDate.set(date, (waterByDate.get(date) ?? 0) + asNumber(metrics.amountMl, 0))
  })
  if (waterRecords.length) {
    writeJson(storage, 'ao3_health_water', {
      today: waterByDate.get(today) ?? 0,
      goal: 2500,
      history: [...waterByDate.entries()].map(([date, amount]) => ({ date, amount, goal: 2500 })),
    }, keys)
  }

  const sleep = records.filter((record) => record.type === 'sleep').map((record) => {
    const metrics = asPlainObject(record.metrics)
    return {
      date: asString(record.date, today),
      sleepTime: asString(metrics.sleepTime, '23:00'),
      wakeTime: asString(metrics.wakeTime, '07:00'),
      hours: asNumber(metrics.hours, 0),
      quality: asString(metrics.quality, 'fair'),
      notes: asString(record.notes),
    }
  })
  if (sleep.length) writeJson(storage, 'ao3_health_sleep', { logs: sleep }, keys)

  const workout = records.filter((record) => record.type === 'workout').map((record) => {
    const metrics = asPlainObject(record.metrics)
    return {
      date: asString(record.date, today),
      name: asString(metrics.name, 'Workout'),
      cat: asString(metrics.category, 'other'),
      duration: asNumber(metrics.durationMinutes, 0),
      calories: asNumber(metrics.calories, 0),
      intensity: asString(metrics.intensity, 'medium'),
      time: new Date(isoString(record.createdAt)).toLocaleTimeString(),
    }
  })
  if (workout.length) writeJson(storage, 'ao3_health_workout', { logs: workout }, keys)

  const screen = records.filter((record) => record.type === 'screen').map((record) => {
    const metrics = asPlainObject(record.metrics)
    return {
      date: asString(record.date, today),
      hours: asNumber(metrics.hours, 0),
      limit: asNumber(metrics.limitHours, 6),
    }
  })
  if (screen.length) {
    const latest = screen[0]
    writeJson(storage, 'ao3_health_screen', {
      today: latest.hours,
      limit: latest.limit,
      history: screen,
    }, keys)
  }
}

function mapEntertainment(storage: Storage, records: CloudRecord[], keys: string[]) {
  const anime = records.filter((record) => record.type === 'anime').map((record) => {
    const data = asPlainObject(record.data)
    return {
      id: cloudRecordId(record, asString(data.id, 'anime')),
      title: asString(data.title, 'Untitled anime'),
      total: asNumber(data.totalEpisodes, 1),
      watched: asNumberArray(data.watchedEpisodes),
      emoji: asString(data.emoji, 'TV'),
    }
  })
  if (anime.length) writeJson(storage, 'ao3_ent_animes', anime, keys)

  const bucket = records.filter((record) => record.type === 'bucket').map((record) => {
    const data = asPlainObject(record.data)
    return {
      id: cloudRecordId(record, asString(data.id, 'bucket')),
      title: asString(data.title, 'Untitled item'),
      cat: asString(data.category, 'other'),
      priority: asString(data.priority, 'medium'),
      done: asString(data.status) === 'done',
      createdAt: isoString(record.createdAt),
    }
  })
  if (bucket.length) writeJson(storage, 'ao3_ent_bucket', bucket, keys)

  const sessions = records.filter((record) => record.type === 'watchtime').map((record) => {
    const data = asPlainObject(record.data)
    return {
      id: cloudRecordId(record, asString(data.id, 'watch')),
      title: asString(data.title, 'Watch session'),
      mins: asNumber(data.minutes, 0),
      date: asString(data.date, new Date().toISOString().slice(0, 10)),
    }
  })
  if (sessions.length) {
    const today = new Date().toISOString().slice(0, 10)
    const mins = sessions.filter((session) => session.date === today).reduce((total, session) => total + session.mins, 0)
    writeJson(storage, 'ao3_ent_watchtime', { sessions, today: { date: today, mins } }, keys)
  }
}

function mapVault(storage: Storage, records: CloudRecord[], keys: string[]) {
  if (!records.length) return
  writeJson(storage, 'ao3_vault_cloud_documents', records.map((record) => ({
    id: cloudRecordId(record, asString(record.id, 'vault')),
    title: asString(record.title, 'Vault document'),
    filename: asString(record.originalFilename),
    contentType: asString(record.contentType),
    bytes: asNumber(record.bytes, 0),
    status: asString(record.status, 'queued'),
    createdAt: isoString(record.createdAt),
  })), keys)
}

function mapSettings(storage: Storage, settings: CloudRecord | null | undefined, keys: string[]) {
  if (!settings) return
  const profile = asPlainObject(settings.profile)
  const preferences = asPlainObject(settings.preferences)
  const name = asString(profile.name)
  const role = asString(profile.role)
  const theme = asString(settings.theme)
  if (name) writeJson(storage, 'ao3_name', name, keys)
  if (role) writeJson(storage, 'ao3_role', role, keys)
  if (theme === 'dark' || theme === 'light') writeJson(storage, 'ao3_theme', theme, keys)
  const density = asNumber(preferences.density, 0)
  if (density) writeJson(storage, 'ao3_density', density, keys)
}

export async function hydrateLegacyStorageFromCloud(storage: Storage = window.localStorage): Promise<LegacyHydrationResult> {
  if (!apiClient.isConfigured()) return { configured: false, synced: false, keys: [], errors: [] }
  if (!window.Clerk?.session) {
    return { configured: true, synced: false, keys: [], errors: ['Cloud hydration requires a signed-in Clerk session.'] }
  }

  const keys: string[] = []
  const errors: string[] = []

  const [deadlines, bookmarks, health, entertainment, vault, settings] = await Promise.allSettled([
    getAllCloudItems('/deadlines'),
    getAllCloudItems('/bookmarks'),
    getAllCloudItems('/health-logs'),
    getAllCloudItems('/entertainment-data'),
    getAllCloudDocuments('/ai-vault/documents'),
    apiClient.get<SettingsResponse>('/settings'),
  ])

  if (deadlines.status === 'fulfilled' && deadlines.value.length) {
    writeJson(storage, 'ao3_deadlines', deadlines.value.map(mapDeadline), keys)
  } else if (deadlines.status === 'rejected') errors.push(errorMessage(deadlines.reason))

  if (bookmarks.status === 'fulfilled' && bookmarks.value.length) {
    writeJson(storage, 'ao3_bookmarks', bookmarks.value.map(mapBookmark), keys)
  } else if (bookmarks.status === 'rejected') errors.push(errorMessage(bookmarks.reason))

  if (health.status === 'fulfilled' && health.value.length) {
    mapHealth(storage, health.value, keys)
  } else if (health.status === 'rejected') errors.push(errorMessage(health.reason))

  if (entertainment.status === 'fulfilled' && entertainment.value.length) {
    mapEntertainment(storage, entertainment.value, keys)
  } else if (entertainment.status === 'rejected') errors.push(errorMessage(entertainment.reason))

  if (vault.status === 'fulfilled' && vault.value.length) {
    mapVault(storage, vault.value, keys)
  } else if (vault.status === 'rejected') errors.push(errorMessage(vault.reason))

  if (settings.status === 'fulfilled') {
    mapSettings(storage, settings.value.settings, keys)
  } else {
    errors.push(errorMessage(settings.reason))
  }

  return {
    configured: true,
    synced: keys.length > 0,
    keys,
    errors,
  }
}

export function canHydrateLegacyStorageFromCloud() {
  return apiClient.isConfigured() && Boolean(window.Clerk?.session)
}
