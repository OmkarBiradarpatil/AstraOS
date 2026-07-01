const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

function candidateFromInput(input: string) {
  const value = input.trim()
  if (!value) return ''
  if (YOUTUBE_ID_PATTERN.test(value)) return value

  const urlMatch = value.match(/(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)\/[^\s<>"']+/i)
  return (urlMatch?.[0] ?? value).replace(/[),.;\]]+$/g, '')
}

function asUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    try {
      return new URL(`https://${value}`)
    } catch {
      return null
    }
  }
}

export function extractYouTubeId(input: string): string | null {
  const value = candidateFromInput(input)
  if (!value) return null
  if (YOUTUBE_ID_PATTERN.test(value)) return value

  const url = asUrl(value)
  if (url) {
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '').toLowerCase()
    const pathParts = url.pathname.split('/').filter(Boolean)

    if (host === 'youtu.be' && YOUTUBE_ID_PATTERN.test(pathParts[0] ?? '')) {
      return pathParts[0]
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const queryId = url.searchParams.get('v') ?? url.searchParams.get('vi')
      if (queryId && YOUTUBE_ID_PATTERN.test(queryId)) return queryId

      const nested = url.searchParams.get('u') ?? url.searchParams.get('url') ?? url.searchParams.get('q')
      if (nested) {
        const nestedTarget = nested.startsWith('/') ? `https://www.youtube.com${nested}` : nested
        const nestedId: string | null = extractYouTubeId(nestedTarget)
        if (nestedId) return nestedId
      }

      const routeId = pathParts.find((part, index) => {
        const previous = pathParts[index - 1]
        return ['embed', 'shorts', 'v', 'live'].includes(previous ?? '') && YOUTUBE_ID_PATTERN.test(part)
      })
      if (routeId) return routeId
    }
  }

  const fallback = value.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?.*?[?&]?v=|embed\/|shorts\/|v\/|live\/))([A-Za-z0-9_-]{11})/)
  return fallback?.[1] ?? null
}

export function extractYouTubeStartSeconds(input: string) {
  const value = candidateFromInput(input)
  const url = asUrl(value)
  const raw = url?.searchParams.get('start') ?? url?.searchParams.get('t')
  if (!raw) return 0

  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i)
  if (match) {
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  }

  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

export function getYouTubeEmbedUrl(input: string, options: { autoplay?: boolean; startSeconds?: number } = {}) {
  const videoId = extractYouTubeId(input)
  if (!videoId) return null
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    playsinline: '1',
    controls: '1',
    fs: '1',
    iv_load_policy: '3',
  })
  if (options.autoplay) {
    params.set('autoplay', '1')
    params.set('mute', '1')
  }
  const startSeconds = Math.max(0, Math.floor(options.startSeconds ?? extractYouTubeStartSeconds(input)))
  if (startSeconds > 0) params.set('start', String(startSeconds))
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

export interface YouTubeQueueItem {
  id: string
  url: string
  title: string
  addedAt: string
  startSeconds?: number
}

export function createYouTubeQueueItem(input: string, addedAt = new Date().toISOString()): YouTubeQueueItem | null {
  const videoId = extractYouTubeId(input)
  if (!videoId) return null

  const startSeconds = extractYouTubeStartSeconds(input)
  return {
    id: videoId,
    url: input.trim() || videoId,
    title: `YouTube lesson ${videoId.slice(0, 4)}-${videoId.slice(7)}`,
    addedAt,
    ...(startSeconds > 0 ? { startSeconds } : {}),
  }
}

export function addYouTubeQueueItem(
  queue: YouTubeQueueItem[],
  item: YouTubeQueueItem,
  options: { currentVideoId?: string; limit?: number } = {},
) {
  const limit = options.limit ?? 24
  if (item.id === options.currentVideoId || queue.some((queued) => queued.id === item.id)) {
    return queue.slice(0, limit)
  }

  return [...queue, item].slice(0, limit)
}

export function createYouTubePlayerCommand(func: 'playVideo' | 'pauseVideo' | 'seekTo', args: unknown[] = []) {
  return JSON.stringify({
    event: 'command',
    func,
    args,
  })
}
