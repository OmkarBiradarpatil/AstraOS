import { describe, expect, it } from 'vitest'
import {
  addYouTubeQueueItem,
  createYouTubePlayerCommand,
  createYouTubeQueueItem,
  extractYouTubeId,
  extractYouTubeStartSeconds,
  getYouTubeEmbedUrl,
} from './youtube'

describe('extractYouTubeId', () => {
  it('accepts raw video ids', () => {
    expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses common YouTube URL formats', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=test')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses pasted text and nested YouTube redirect URLs', () => {
    expect(extractYouTubeId('watch this: https://youtu.be/dQw4w9WgXcQ?t=43.')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube.com/attribution_link?u=/watch%3Fv%3DdQw4w9WgXcQ%26feature%3Dshare')).toBe('dQw4w9WgXcQ')
  })

  it('rejects invalid values', () => {
    expect(extractYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extractYouTubeId('not a youtube url')).toBeNull()
  })
})

describe('extractYouTubeStartSeconds', () => {
  it('parses numeric and compact timestamp formats', () => {
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=43')).toBe(43)
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=1m20s')).toBe(80)
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?start=90')).toBe(90)
  })
})

describe('getYouTubeEmbedUrl', () => {
  it('builds compatible embed URLs', () => {
    expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ', { autoplay: true })).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&enablejsapi=1&playsinline=1&controls=1&fs=1&iv_load_policy=3&autoplay=1&mute=1',
    )
  })

  it('preserves timestamp intent in embed URLs', () => {
    expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=43', { autoplay: true })).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&enablejsapi=1&playsinline=1&controls=1&fs=1&iv_load_policy=3&autoplay=1&mute=1&start=43',
    )
  })
})

describe('YouTube queue helpers', () => {
  it('creates stable queue items from valid links', () => {
    expect(createYouTubeQueueItem('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '2026-06-07T00:00:00.000Z')).toEqual({
      id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'YouTube lesson dQw4-gXcQ',
      addedAt: '2026-06-07T00:00:00.000Z',
    })
  })

  it('keeps timestamp metadata on queued links', () => {
    expect(createYouTubeQueueItem('https://youtu.be/dQw4w9WgXcQ?t=43', '2026-06-07T00:00:00.000Z')).toMatchObject({
      id: 'dQw4w9WgXcQ',
      startSeconds: 43,
    })
  })

  it('rejects invalid queue inputs', () => {
    expect(createYouTubeQueueItem('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('prevents duplicate and currently playing videos from entering the queue', () => {
    const first = createYouTubeQueueItem('dQw4w9WgXcQ', '2026-06-07T00:00:00.000Z')!
    const second = createYouTubeQueueItem('ysz5S6PUM-U', '2026-06-07T00:01:00.000Z')!

    expect(addYouTubeQueueItem([first], first)).toEqual([first])
    expect(addYouTubeQueueItem([first], second, { currentVideoId: 'ysz5S6PUM-U' })).toEqual([first])
    expect(addYouTubeQueueItem([first], second)).toEqual([first, second])
  })
})

describe('createYouTubePlayerCommand', () => {
  it('formats YouTube iframe API commands', () => {
    expect(createYouTubePlayerCommand('seekTo', [42, true])).toBe(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [42, true] }),
    )
  })
})
