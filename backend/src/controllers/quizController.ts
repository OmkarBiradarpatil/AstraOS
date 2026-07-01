import type { RequestHandler } from 'express'
import { getDailyQuiz } from '../services/dailyQuizService.js'
import { ok } from '../utils/http.js'

export const dailyQuizController: RequestHandler = async (req, res, next) => {
  try {
    const region = typeof req.query.region === 'string' ? req.query.region : 'IN'
    const quiz = await getDailyQuiz(region)
    ok(res, quiz)
  } catch (error) {
    next(error)
  }
}
