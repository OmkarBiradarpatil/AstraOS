import { expect, type APIRequestContext } from '@playwright/test'

export function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined
}

export function requireClerkE2eEnv(name: string) {
  const value = optionalEnv(name)
  if (!value) throw new Error(`${name} is required for Clerk e2e.`)
  return value
}

export function apiBaseUrl() {
  return requireClerkE2eEnv('VITE_API_BASE_URL').replace(/\/$/, '')
}

export async function expectBackendMe(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiBaseUrl()}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  const body = await response.json() as {
    ok?: boolean
    data?: { auth?: { userId?: string } }
  }
  expect(body.ok).toBe(true)
  expect(body.data?.auth?.userId).toBeTruthy()
  return body
}
