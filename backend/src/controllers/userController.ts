import type { RequestHandler } from 'express'
import { getUserProfile, updateUserProfile } from '../services/userService.js'
import type { UpdateUserProfileInput } from '../validators/user.js'
import { ok } from '../utils/http.js'

export const getMeController: RequestHandler = async (req, res, next) => {
  try {
    const profile = await getUserProfile(req.astraAuth!.userId)
    return ok(res, {
      auth: req.astraAuth,
      profile,
    })
  } catch (error) {
    return next(error)
  }
}

export const updateMeController: RequestHandler = async (req, res, next) => {
  try {
    const profile = await updateUserProfile(req.astraAuth!.userId, req.body as UpdateUserProfileInput)
    return ok(res, profile)
  } catch (error) {
    return next(error)
  }
}

