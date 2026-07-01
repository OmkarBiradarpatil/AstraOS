export function env(name: string) {
  const value = process.env[name]?.trim()
  return value || undefined
}

export function requiredEnv(name: string) {
  const value = env(name)
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

export function boolEnv(name: string) {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').toLowerCase())
}

export function configured(name: string) {
  return Boolean(env(name))
}
