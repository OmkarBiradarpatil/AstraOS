import type { Role } from '../utils/roles.js'

declare global {
  namespace Express {
    interface Request {
      requestId: string
      astraAuth?: {
        userId: string
        orgId?: string
        role: Role
      }
      astraUser?: unknown
    }
  }
}

export {}
