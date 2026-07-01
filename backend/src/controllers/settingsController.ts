import type { RequestHandler } from 'express'
import { SettingsModel } from '../models/settings.js'
import { connectMongo, isMongoConfigured } from '../services/database.js'
import { deleteCached, cached } from '../services/redisService.js'
import type { SettingsInput } from '../validators/data.js'
import { ApiError, ok } from '../utils/http.js'

function settingsKey(userId: string) {
  return `query:settings:${userId}`
}

async function requireMongo() {
  if (!isMongoConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'MongoDB is not configured.')
  await connectMongo()
}

export const getSettingsController: RequestHandler = async (req, res, next) => {
  try {
    await requireMongo()
    const result = await cached(settingsKey(req.astraAuth!.userId), 120, () =>
      SettingsModel.findOne({ ownerId: req.astraAuth!.userId }).lean(),
    )
    return ok(res, { settings: result.value, cache: result.cache })
  } catch (error) {
    return next(error)
  }
}

export const updateSettingsController: RequestHandler = async (req, res, next) => {
  try {
    await requireMongo()
    const body = req.body as SettingsInput
    const settings = await SettingsModel.findOneAndUpdate(
      { ownerId: req.astraAuth!.userId },
      {
        $set: {
          ...body,
          orgId: req.astraAuth!.orgId ?? null,
        },
        $setOnInsert: {
          ownerId: req.astraAuth!.userId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean()
    await deleteCached(settingsKey(req.astraAuth!.userId))
    return ok(res, settings)
  } catch (error) {
    return next(error)
  }
}

