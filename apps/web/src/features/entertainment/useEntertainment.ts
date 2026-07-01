import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../lib/api/apiClient'
import { mergeRemoteWithLocal } from '../../lib/api/cloudMerge'
import { getAllCloudItems } from '../../lib/api/cloudPagination'
import {
  asNumber,
  asNumberArray,
  asPlainObject,
  asString,
  cloudRecordId,
  isMongoId,
  isoString,
  type CloudRecord,
} from '../../lib/api/cloudRecords'
import { nowIso, todayIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import type { Anime, BucketItem, WatchSession } from '../../types/domain'

const initialAnime: Anime[] = []

const initialBucket: BucketItem[] = []

const bucketCategories = ['watch', 'read', 'visit', 'learn', 'other'] as const
const priorities = ['low', 'medium', 'high', 'critical'] as const
const bucketStatuses = ['pending', 'in-progress', 'done'] as const

function toAnime(record: CloudRecord): Anime {
  const data = asPlainObject(record.data)
  return {
    id: cloudRecordId(record, uid('anime')),
    title: asString(data.title, 'Untitled anime'),
    totalEpisodes: Math.max(1, Math.round(asNumber(data.totalEpisodes, 1))),
    watchedEpisodes: asNumberArray(data.watchedEpisodes).sort((a, b) => a - b),
    emoji: asString(data.emoji, 'TV'),
    createdAt: isoString(record.createdAt),
  }
}

function toAnimePayload(item: Anime) {
  return {
    type: 'anime',
    data: {
      title: item.title,
      totalEpisodes: item.totalEpisodes,
      watchedEpisodes: item.watchedEpisodes,
      emoji: item.emoji,
    },
  }
}

function toBucketItem(record: CloudRecord): BucketItem {
  const data = asPlainObject(record.data)
  const category = asString(data.category)
  const priority = asString(data.priority)
  const status = asString(data.status)
  return {
    id: cloudRecordId(record, uid('bucket')),
    title: asString(data.title, 'Untitled item'),
    category: bucketCategories.includes(category as BucketItem['category'])
      ? category as BucketItem['category']
      : 'other',
    priority: priorities.includes(priority as BucketItem['priority'])
      ? priority as BucketItem['priority']
      : 'medium',
    status: bucketStatuses.includes(status as BucketItem['status'])
      ? status as BucketItem['status']
      : 'pending',
    createdAt: isoString(record.createdAt),
    completedAt: asString(data.completedAt),
  }
}

function toBucketPayload(item: BucketItem) {
  return {
    type: 'bucket',
    data: {
      title: item.title,
      category: item.category,
      priority: item.priority,
      status: item.status,
      completedAt: item.completedAt,
    },
  }
}

function toWatchSession(record: CloudRecord): WatchSession {
  const data = asPlainObject(record.data)
  return {
    id: cloudRecordId(record, uid('watch')),
    title: asString(data.title, 'Watch session'),
    minutes: Math.max(1, Math.round(asNumber(data.minutes, 1))),
    date: asString(data.date, todayIso()),
    createdAt: isoString(record.createdAt),
  }
}

function toWatchPayload(item: WatchSession) {
  return {
    type: 'watchtime',
    data: {
      title: item.title,
      minutes: item.minutes,
      date: item.date,
    },
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Entertainment cloud sync failed.'
}

export function useEntertainment() {
  const [anime, setAnime] = usePersistentState<Anime[]>('astraos.entertainment.anime', initialAnime)
  const [bucket, setBucket] = usePersistentState<BucketItem[]>('astraos.entertainment.bucket', initialBucket)
  const [sessions, setSessions] = usePersistentState<WatchSession[]>('astraos.entertainment.sessions', [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cloudConfigured = apiClient.canUseProtectedApi()

  useEffect(() => {
    if (!cloudConfigured) return
    let cancelled = false

    async function loadEntertainmentData() {
      setIsLoading(true)
      try {
        const response = await getAllCloudItems('/entertainment-data')
        if (cancelled) return
        const remoteAnime = response.filter((record) => record.type === 'anime').map(toAnime)
        const remoteBucket = response.filter((record) => record.type === 'bucket').map(toBucketItem)
        const remoteSessions = response.filter((record) => record.type === 'watchtime').map(toWatchSession)
        if (remoteAnime.length) setAnime((current) => mergeRemoteWithLocal(remoteAnime, current))
        if (remoteBucket.length) setBucket((current) => mergeRemoteWithLocal(remoteBucket, current))
        if (remoteSessions.length) setSessions((current) => mergeRemoteWithLocal(remoteSessions, current))
        setError(null)
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadEntertainmentData()

    return () => {
      cancelled = true
    }
  }, [cloudConfigured, setAnime, setBucket, setSessions])

  return useMemo(
    () => ({
      anime,
      bucket,
      sessions,
      isLoading,
      error,
      isCloudBacked: cloudConfigured && !error,
      async addAnime(input: { title: string; totalEpisodes: number; emoji: string }) {
        const title = input.title.trim()
        if (!title) return
        const item: Anime = {
          id: uid('anime'),
          title,
          totalEpisodes: Math.max(1, Math.round(input.totalEpisodes)),
          watchedEpisodes: [],
          emoji: input.emoji.trim().slice(0, 3).toUpperCase() || 'TV',
          createdAt: nowIso(),
        }
        setAnime((current) => [item, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/entertainment-data', toAnimePayload(item), {
            headers: { 'x-idempotency-key': item.id },
          })
          setAnime((current) => current.map((entry) => (entry.id === item.id ? toAnime(created) : entry)))
          setError(null)
        } catch (caught) {
          setAnime((current) => current.filter((entry) => entry.id !== item.id))
          setError(errorMessage(caught))
        }
      },
      async toggleEpisode(animeId: string, episode: number) {
        const previous = anime.find((item) => item.id === animeId)
        if (!previous) return
        const watched = new Set(previous.watchedEpisodes)
        if (watched.has(episode)) watched.delete(episode)
        else watched.add(episode)
        const next = { ...previous, watchedEpisodes: [...watched].sort((a, b) => a - b) }
        setAnime((current) =>
          current.map((item) => (item.id === animeId ? next : item)),
        )
        if (!cloudConfigured) return

        try {
          const saved = isMongoId(animeId)
            ? await apiClient.patch<CloudRecord>(`/entertainment-data/${animeId}`, toAnimePayload(next))
            : await apiClient.post<CloudRecord>('/entertainment-data', toAnimePayload(next), {
              headers: { 'x-idempotency-key': animeId },
            })
          setAnime((current) => current.map((item) => (item.id === animeId ? toAnime(saved) : item)))
          setError(null)
        } catch (caught) {
          setAnime((current) => current.map((item) => (item.id === animeId ? previous : item)))
          setError(errorMessage(caught))
        }
      },
      async addBucketItem(input: Pick<BucketItem, 'title' | 'category' | 'priority'>) {
        const title = input.title.trim()
        if (!title) return
        const item: BucketItem = {
          id: uid('bucket'),
          title,
          category: input.category,
          priority: input.priority,
          status: 'pending',
          createdAt: nowIso(),
          completedAt: '',
        }
        setBucket((current) => [item, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/entertainment-data', toBucketPayload(item), {
            headers: { 'x-idempotency-key': item.id },
          })
          setBucket((current) => current.map((entry) => (entry.id === item.id ? toBucketItem(created) : entry)))
          setError(null)
        } catch (caught) {
          setBucket((current) => current.filter((entry) => entry.id !== item.id))
          setError(errorMessage(caught))
        }
      },
      async setBucketStatus(id: string, status: BucketItem['status']) {
        const previous = bucket.find((item) => item.id === id)
        if (!previous) return
        const next = { ...previous, status, completedAt: status === 'done' ? nowIso() : '' }
        setBucket((current) =>
          current.map((item) => (item.id === id ? next : item)),
        )
        if (!cloudConfigured) return

        try {
          const saved = isMongoId(id)
            ? await apiClient.patch<CloudRecord>(`/entertainment-data/${id}`, toBucketPayload(next))
            : await apiClient.post<CloudRecord>('/entertainment-data', toBucketPayload(next), {
              headers: { 'x-idempotency-key': id },
            })
          setBucket((current) => current.map((item) => (item.id === id ? toBucketItem(saved) : item)))
          setError(null)
        } catch (caught) {
          setBucket((current) => current.map((item) => (item.id === id ? previous : item)))
          setError(errorMessage(caught))
        }
      },
      async logWatchSession(input: { title: string; minutes: number }) {
        const title = input.title.trim()
        if (!title) return
        const session: WatchSession = {
          id: uid('watch'),
          title,
          minutes: Math.max(1, Math.round(input.minutes)),
          date: todayIso(),
          createdAt: nowIso(),
        }
        setSessions((current) => [session, ...current])
        if (!cloudConfigured) return

        try {
          const created = await apiClient.post<CloudRecord>('/entertainment-data', toWatchPayload(session), {
            headers: { 'x-idempotency-key': session.id },
          })
          setSessions((current) => current.map((entry) => (entry.id === session.id ? toWatchSession(created) : entry)))
          setError(null)
        } catch (caught) {
          setSessions((current) => current.filter((entry) => entry.id !== session.id))
          setError(errorMessage(caught))
        }
      },
    }),
    [anime, bucket, cloudConfigured, error, isLoading, sessions, setAnime, setBucket, setSessions],
  )
}
