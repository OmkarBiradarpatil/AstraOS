import { z } from 'zod'

function requireAtLeastOneField<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial().strict().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  })
}

export const mongoIdParamSchema = z.object({
  id: z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid id.'),
})

const taskFields = {
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2000),
  status: z.enum(['todo', 'doing', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  estimateMinutes: z.coerce.number().int().min(5).max(720),
  dueDate: z.coerce.date().nullable().optional(),
}

export const taskSchema = z.object({
  ...taskFields,
  notes: taskFields.notes.default(''),
  status: taskFields.status.default('todo'),
  priority: taskFields.priority.default('medium'),
  tags: taskFields.tags.default([]),
  estimateMinutes: taskFields.estimateMinutes.default(25),
})
export const taskUpdateSchema = requireAtLeastOneField(z.object(taskFields))

const bookmarkFields = {
  title: z.string().trim().min(1).max(180),
  url: z.string().trim().url().max(2000),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000),
}

export const bookmarkSchema = z.object({
  ...bookmarkFields,
  category: bookmarkFields.category.default('Reference'),
  description: bookmarkFields.description.default(''),
})
export const bookmarkUpdateSchema = requireAtLeastOneField(z.object(bookmarkFields))

const deadlineFields = {
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000),
  category: z.string().trim().min(1).max(80),
  dueDate: z.coerce.date(),
  dueTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  reminderEmail: z.string().trim().email().max(320).or(z.literal('')),
  remindBefore: z.enum(['1h', '3h', '6h', '12h', '1d', '2d', '3d']),
  remindAt: z.coerce.date().nullable().optional(),
}

export const deadlineSchema = z.object({
  ...deadlineFields,
  description: deadlineFields.description.default(''),
  category: deadlineFields.category.default('General'),
  dueTime: deadlineFields.dueTime.default('23:59'),
  reminderEmail: deadlineFields.reminderEmail.default(''),
  remindBefore: deadlineFields.remindBefore.default('1d'),
})
export const deadlineUpdateSchema = requireAtLeastOneField(z.object(deadlineFields))

const jsonObject = z.record(z.string(), z.unknown()).default({})
const jsonObjectUpdate = z.record(z.string(), z.unknown())

const healthLogFields = {
  type: z.enum(['water', 'sleep', 'workout', 'screen', 'checkin', 'custom']),
  date: z.string().trim().min(4).max(32),
  metrics: jsonObjectUpdate,
  notes: z.string().trim().max(2000),
}

export const healthLogSchema = z.object({
  ...healthLogFields,
  metrics: jsonObject,
  notes: healthLogFields.notes.default(''),
})
export const healthLogUpdateSchema = requireAtLeastOneField(z.object(healthLogFields))

export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  profile: jsonObject.optional(),
  preferences: jsonObject.optional(),
  flags: jsonObject.optional(),
}).strict()

const entertainmentDataFields = {
  type: z.enum(['anime', 'bucket', 'watchtime', 'challenge', 'game', 'preference']),
  data: jsonObjectUpdate,
}

export const entertainmentDataSchema = z.object({
  ...entertainmentDataFields,
  data: jsonObject,
})
export const entertainmentDataUpdateSchema = requireAtLeastOneField(z.object(entertainmentDataFields))

export type MongoIdParamInput = z.infer<typeof mongoIdParamSchema>
export type TaskInput = z.infer<typeof taskSchema>
export type BookmarkInput = z.infer<typeof bookmarkSchema>
export type DeadlineInput = z.infer<typeof deadlineSchema>
export type HealthLogInput = z.infer<typeof healthLogSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
export type EntertainmentDataInput = z.infer<typeof entertainmentDataSchema>
