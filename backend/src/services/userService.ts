import type { Role } from '../utils/roles.js'
import { connectMongo, isMongoConfigured } from './database.js'
import { UserModel } from '../models/user.js'
import { ApiError } from '../utils/http.js'

interface SyncUserInput {
  userId: string
  orgId?: string
  role: Role
  email?: string
  name?: string
}

async function requireMongo() {
  if (!isMongoConfigured()) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'MongoDB is not configured.')
  await connectMongo()
}

export async function syncUserProfile(input: SyncUserInput) {
  if (!isMongoConfigured()) return null
  await connectMongo()
  return UserModel.findOneAndUpdate(
    { clerkUserId: input.userId },
    {
      $set: {
        role: input.role,
        orgId: input.orgId ?? null,
        lastSeenAt: new Date(),
        ...(input.email ? { email: input.email } : {}),
        ...(input.name ? { name: input.name } : {}),
      },
      $setOnInsert: {
        clerkUserId: input.userId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean()
}

export async function getUserProfile(userId: string) {
  if (!isMongoConfigured()) return null
  await connectMongo()
  return UserModel.findOne({ clerkUserId: userId }).lean()
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<Pick<SyncUserInput, 'name'>>,
) {
  await requireMongo()
  return UserModel.findOneAndUpdate(
    { clerkUserId: userId },
    {
      $set: {
        ...patch,
        lastSeenAt: new Date(),
      },
      $setOnInsert: {
        clerkUserId: userId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean()
}
