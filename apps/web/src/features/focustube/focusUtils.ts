import type { FocusSession } from '../../types/domain'
import {
  extractYouTubeId as extractLegacyYouTubeId,
  getYouTubeEmbedUrl,
} from '../../legacy/youtube'

export function extractYouTubeId(value: string) {
  return extractLegacyYouTubeId(value) ?? ''
}

export function getFocusMinutes(sessions: FocusSession[]) {
  return sessions.reduce((total, session) => total + session.minutesFocused, 0)
}

export function getEmbedUrl(videoId: string) {
  return getYouTubeEmbedUrl(videoId) ?? ''
}
