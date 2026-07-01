import { z } from 'zod'

export const assistantMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().trim().max(120).optional(),
  mode: z.string().trim().max(40).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
  })).max(12).optional(),
})

export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>
