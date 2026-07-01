export const roles = ['student', 'parent', 'teacher', 'admin'] as const

export type Role = (typeof roles)[number]

export function normalizeRole(value: unknown): Role {
  return roles.includes(value as Role) ? (value as Role) : 'student'
}

export function canAccessRole(userRole: Role, allowed: Role[]) {
  if (userRole === 'admin') return true
  return allowed.includes(userRole)
}
