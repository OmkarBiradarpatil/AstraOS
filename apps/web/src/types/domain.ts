export type Priority = 'low' | 'medium' | 'high' | 'critical'

export type TaskStatus = 'todo' | 'doing' | 'done'

export type ID = string

export interface UserProfile {
  id: ID
  name: string
  email: string
  role: 'student' | 'parent' | 'teacher' | 'admin'
  createdAt: string
}

export interface Task {
  id: ID
  title: string
  notes: string
  status: TaskStatus
  priority: Priority
  tags: string[]
  estimateMinutes: number
  dueDate: string
  createdAt: string
  updatedAt: string
}

export interface Deadline {
  id: ID
  title: string
  dueDate: string
  dueTime: string
  category: string
  description: string
  reminderEmail: string
  remindBefore: '1h' | '3h' | '6h' | '12h' | '1d' | '2d' | '3d'
  createdAt: string
}

export interface Bookmark {
  id: ID
  title: string
  url: string
  category: string
  description: string
  createdAt: string
}

export interface ManualReminder {
  id: ID
  text: string
  time: string
  type: 'deadline' | 'habit' | 'health' | 'custom'
  createdAt: string
}

export interface WaterLog {
  id: ID
  amountMl: number
  date: string
  createdAt: string
}

export interface SleepLog {
  id: ID
  date: string
  sleepTime: string
  wakeTime: string
  hours: number
  quality: 'poor' | 'fair' | 'good' | 'excellent'
  notes: string
  createdAt: string
}

export interface WorkoutLog {
  id: ID
  date: string
  name: string
  category: 'cardio' | 'strength' | 'mobility' | 'sport' | 'other'
  durationMinutes: number
  calories: number
  intensity: 'low' | 'medium' | 'high'
  createdAt: string
}

export interface ScreenLog {
  id: ID
  date: string
  hours: number
  limitHours: number
  createdAt: string
}

export interface FocusNote {
  id: ID
  sessionId: ID
  text: string
  timestamp: string
  createdAt: string
}

export interface FocusSession {
  id: ID
  title: string
  videoId: string
  startedAt: string
  minutesFocused: number
  notes: FocusNote[]
}

export interface VaultSection {
  id: ID
  name: string
  color: string
  createdAt: string
}

export interface VaultFolder {
  id: ID
  sectionId: ID
  name: string
  createdAt: string
}

export interface VaultFile {
  id: ID
  folderId: ID
  name: string
  size: number
  type: string
  createdAt: string
}

export interface DiaryEntry {
  id: ID
  title: string
  body: string
  date: string
  updatedAt: string
}

export interface Anime {
  id: ID
  title: string
  totalEpisodes: number
  watchedEpisodes: number[]
  emoji: string
  createdAt: string
}

export interface BucketItem {
  id: ID
  title: string
  category: 'watch' | 'read' | 'visit' | 'learn' | 'other'
  priority: Priority
  status: 'pending' | 'in-progress' | 'done'
  createdAt: string
  completedAt: string
}

export interface WatchSession {
  id: ID
  title: string
  minutes: number
  date: string
  createdAt: string
}

export interface AssistantMessage {
  id: ID
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
