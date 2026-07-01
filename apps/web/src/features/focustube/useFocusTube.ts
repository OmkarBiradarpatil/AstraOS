import { useMemo } from 'react'
import { nowIso, uid } from '../../lib/date'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import type { FocusNote, FocusSession } from '../../types/domain'
import { extractYouTubeId } from './focusUtils'

const initialSessions: FocusSession[] = []

export function useFocusTube() {
  const [sessions, setSessions] = usePersistentState<FocusSession[]>(
    'astraos.focus.sessions',
    initialSessions,
  )

  return useMemo(
    () => ({
      sessions,
      createSession(input: { title: string; video: string; minutesFocused: number }) {
        const videoId = extractYouTubeId(input.video)
        if (!videoId) throw new Error('Enter a valid YouTube URL or video id.')

        const session: FocusSession = {
          id: uid('focus'),
          title: input.title.trim() || 'Untitled focus session',
          videoId,
          startedAt: nowIso(),
          minutesFocused: Math.max(1, Math.round(input.minutesFocused)),
          notes: [],
        }
        setSessions((current) => [session, ...current])
      },
      addNote(sessionId: string, input: { text: string; timestamp: string }) {
        const text = input.text.trim()
        if (!text) return

        setSessions((current) =>
          current.map((session) => {
            if (session.id !== sessionId) return session
            const note: FocusNote = {
              id: uid('focus_note'),
              sessionId,
              text,
              timestamp: input.timestamp.trim() || '00:00',
              createdAt: nowIso(),
            }
            return { ...session, notes: [note, ...session.notes] }
          }),
        )
      },
      removeSession(id: string) {
        setSessions((current) => current.filter((session) => session.id !== id))
      },
    }),
    [sessions, setSessions],
  )
}
