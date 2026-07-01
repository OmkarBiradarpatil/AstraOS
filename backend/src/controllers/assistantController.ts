import type { RequestHandler } from 'express'
import { generateAssistantReply } from '../services/openRouterService.js'
import type { AssistantMessageInput } from '../validators/assistant.js'
import { ok } from '../utils/http.js'

export const assistantMessageController: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as AssistantMessageInput
    const userId = req.astraAuth!.userId
    const reply = await generateAssistantReply({
      message: body.message,
      userId,
      conversationId: body.conversationId,
      mode: body.mode,
      history: body.history,
    })
    return ok(res, {
      conversationId: body.conversationId ?? null,
      reply: reply.content,
      provider: reply.provider,
      model: reply.model,
      usage: reply.usage,
      cache: reply.cache,
      latencyMs: reply.latencyMs,
    })
  } catch (error) {
    return next(error)
  }
}
