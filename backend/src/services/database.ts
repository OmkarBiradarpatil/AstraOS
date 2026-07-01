import mongoose from 'mongoose'
import { env } from '../utils/env.js'

let connectionPromise: Promise<typeof mongoose> | null = null

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(env(name))
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.round(value), min), max)
}

export function isMongoConfigured() {
  return Boolean(env('MONGODB_URI'))
}

export async function connectMongo() {
  const uri = env('MONGODB_URI')
  if (!uri) return null
  connectionPromise ??= mongoose.connect(uri, {
    dbName: env('MONGODB_DB_NAME') ?? 'astraos',
    autoIndex: process.env.NODE_ENV !== 'production',
    maxPoolSize: numberEnv('MONGODB_MAX_POOL_SIZE', 10, 1, 100),
    minPoolSize: numberEnv('MONGODB_MIN_POOL_SIZE', 0, 0, 20),
    serverSelectionTimeoutMS: numberEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5000, 1000, 30000),
    socketTimeoutMS: numberEnv('MONGODB_SOCKET_TIMEOUT_MS', 30000, 5000, 120000),
  }).catch((error) => {
    connectionPromise = null
    throw error
  })
  return connectionPromise
}

export async function mongoHealth() {
  if (!isMongoConfigured()) return { configured: false, connected: false }
  try {
    await connectMongo()
    return { configured: true, connected: mongoose.connection.readyState === 1 }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : 'Mongo connection failed.',
    }
  }
}
