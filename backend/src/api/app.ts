import { clerkMiddleware } from '@clerk/express'
import compression from 'compression'
import cors from 'cors'
import type { CorsOptions } from 'cors'
import express from 'express'
import type { RequestHandler } from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { createApiRouter } from './routes.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { requestId } from '../middleware/requestId.js'
import { ApiError } from '../utils/http.js'
import { boolEnv, env } from '../utils/env.js'

const API_ALLOWED_HEADERS = [
  'authorization',
  'content-type',
  'x-astra-dev-email',
  'x-astra-dev-name',
  'x-astra-dev-role',
  'x-astra-dev-user',
  'x-astra-ops-token',
  'x-idempotency-key',
  'x-request-id',
]

const API_EXPOSED_HEADERS = [
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
  'retry-after',
  'x-idempotency-replayed',
  'x-idempotency-status',
  'x-request-id',
]

function configuredOrigins() {
  const webOrigin = env('WEB_ORIGIN')
  if (!webOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('WEB_ORIGIN is required in production.')
  }
  if (!webOrigin) return true
  return webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function corsOptions(): CorsOptions {
  const origins = configuredOrigins()
  const baseOptions: CorsOptions = {
    allowedHeaders: API_ALLOWED_HEADERS,
    credentials: true,
    exposedHeaders: API_EXPOSED_HEADERS,
    maxAge: 600,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }

  if (origins === true) return { ...baseOptions, origin: true }

  return {
    ...baseOptions,
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new ApiError(403, 'CORS_ORIGIN_DENIED', 'Request origin is not allowed.'))
    },
  }
}

function helmetOptions(): Parameters<typeof helmet>[0] {
  return {
    contentSecurityPolicy: {
      directives: {
        baseUri: ["'none'"],
        defaultSrc: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: process.env.NODE_ENV === 'production'
      ? { includeSubDomains: true, maxAge: 31_536_000, preload: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  }
}

const noStoreApiResponses: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

const requireJsonApiContentType: RequestHandler = (req, _res, next) => {
  if (
    ['PATCH', 'POST', 'PUT'].includes(req.method) &&
    req.header('content-type') &&
    !req.is(['application/json', 'application/*+json'])
  ) {
    return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request content type is not supported.'))
  }
  return next()
}

export function createApp() {
  const app = express()

  if (process.env.NODE_ENV === 'production' || boolEnv('ASTRAOS_TRUST_PROXY')) {
    app.set('trust proxy', 1)
  }

  app.disable('x-powered-by')
  app.use(requestId)
  app.use(helmet(helmetOptions()))
  app.use(compression({ threshold: 1024 }))
  app.use('/api', noStoreApiResponses)
  app.use(cors(corsOptions()))
  app.use('/api', requireJsonApiContentType)
  app.use(express.json({
    limit: env('ASTRAOS_JSON_LIMIT') ?? '1mb',
    strict: true,
    type: ['application/json', 'application/*+json'],
  }))
  if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  }

  const clerkSecretKey = env('CLERK_SECRET_KEY')
  const clerkPublishableKey = env('CLERK_PUBLISHABLE_KEY')
  if (clerkSecretKey && clerkPublishableKey && process.env.NODE_ENV !== 'test') {
    app.use(clerkMiddleware({
      publishableKey: clerkPublishableKey,
      secretKey: clerkSecretKey,
    }))
  }

  app.use('/api', createApiRouter())
  app.use((_req, _res, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'Route was not found.'))
  })
  app.use(errorHandler)

  return app
}
