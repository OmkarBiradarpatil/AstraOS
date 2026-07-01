import { z } from 'zod'

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
}).strict()

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>
