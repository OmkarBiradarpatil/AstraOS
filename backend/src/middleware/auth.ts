import { getAuth } from '@clerk/express'
import type { Request, RequestHandler } from 'express'
import { ApiError } from '../utils/http.js'
import { boolEnv, env } from '../utils/env.js'
import { canAccessRole, normalizeRole, type Role } from '../utils/roles.js'
import { syncUserProfile } from '../services/userService.js'

const AUTH_USER_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/

function claimString(claims: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = claims?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function safeAuthUserId(value: string | undefined, fallback: string) {
  const userId = value?.trim() || fallback
  if (!AUTH_USER_ID_PATTERN.test(userId)) {
    throw new ApiError(400, 'INVALID_AUTH_USER_ID', 'Authenticated user id is not valid.')
  }
  return userId
}

async function syncRequestUser(req: Request, claims?: Record<string, unknown>) {
  if (!req.astraAuth) return
  const email = claimString(claims, ['email', 'email_address', 'primary_email_address'])
  const name = claimString(claims, ['name', 'full_name', 'first_name'])
  const allowDevProfileHeaders = boolEnv('ASTRAOS_ALLOW_DEV_AUTH') && process.env.NODE_ENV !== 'production'
  req.astraUser = await syncUserProfile({
    userId: req.astraAuth.userId,
    orgId: req.astraAuth.orgId,
    role: req.astraAuth.role,
    email: email ?? (allowDevProfileHeaders ? req.header('x-astra-dev-email') : undefined) ?? undefined,
    name: name ?? (allowDevProfileHeaders ? req.header('x-astra-dev-name') : undefined) ?? undefined,
  })
}

export const requireAstraAuth: RequestHandler = async (req, _res, next) => {
  if (boolEnv('ASTRAOS_ALLOW_DEV_AUTH') && process.env.NODE_ENV !== 'production') {
    req.astraAuth = {
      userId: safeAuthUserId(req.header('x-astra-dev-user'), 'local_dev_user'),
      role: normalizeRole(req.header('x-astra-dev-role')),
    }
    await syncRequestUser(req)
    return next()
  }

  if (!env('CLERK_SECRET_KEY') || !env('CLERK_PUBLISHABLE_KEY')) {
    return next(new ApiError(500, 'AUTH_NOT_CONFIGURED', 'Clerk is not configured.'))
  }

  let auth: ReturnType<typeof getAuth>
  try {
    auth = getAuth(req)
  } catch {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired session.'))
  }

  if (!auth.userId) return next(new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.'))
  const claims = auth.sessionClaims as Record<string, unknown> | undefined
  const metadata = claims?.metadata as Record<string, unknown> | undefined
  req.astraAuth = {
    userId: safeAuthUserId(auth.userId, 'unknown_user'),
    orgId: auth.orgId ? safeAuthUserId(auth.orgId, 'unknown_org') : undefined,
    role: normalizeRole(metadata?.role),
  }
  await syncRequestUser(req, claims)
  return next()
}

export function requireRole(allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.astraAuth
    if (!auth) return next(new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.'))
    if (!canAccessRole(auth.role, allowed)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Your role cannot access this resource.'))
    }
    return next()
  }
}
