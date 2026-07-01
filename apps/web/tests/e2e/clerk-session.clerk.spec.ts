import { test } from '@playwright/test'
import { expectBackendMe, optionalEnv, requireClerkE2eEnv } from './helpers/clerkAuth'

test('backend accepts env-provided Clerk session JWT', async ({ request }) => {
  test.skip(
    process.env.ASTRAOS_E2E_CLERK !== '1' && process.env.ASTRAOS_E2E_CLERK_JWT !== '1',
    'Set ASTRAOS_E2E_CLERK=1 or ASTRAOS_E2E_CLERK_JWT=1 to run Clerk e2e.',
  )

  const token = optionalEnv('ASTRAOS_E2E_CLERK_SESSION_JWT') || requireClerkE2eEnv('ASTRAOS_SMOKE_CLERK_TOKEN')
  await expectBackendMe(request, token)
})
