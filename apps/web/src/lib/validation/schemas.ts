import { z } from 'zod'

export const prioritySchema = z.enum(['low', 'medium', 'high', 'critical'])

export const taskInputSchema = z.object({
  title: z.string().trim().min(2, 'Task title is required').max(160),
  notes: z.string().trim().max(2000).default(''),
  priority: prioritySchema.default('medium'),
  dueDate: z.string().default(''),
  estimateMinutes: z.coerce.number().int().min(5).max(720).default(25),
  tags: z.string().default(''),
})

export const deadlineInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  dueDate: z.string().min(1),
  dueTime: z.string().default('23:59'),
  category: z.string().trim().max(80).default('General'),
  description: z.string().trim().max(1000).default(''),
  reminderEmail: z.string().trim().email().or(z.literal('')).default(''),
  remindBefore: z.enum(['1h', '3h', '6h', '12h', '1d', '2d', '3d']).default('1d'),
})

export const bookmarkInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  url: z.string().trim().min(3).max(500),
  category: z.string().trim().min(1).max(80).default('Reference'),
  description: z.string().trim().max(500).default(''),
})

export const healthNumberSchema = z.coerce.number().finite().min(0)
