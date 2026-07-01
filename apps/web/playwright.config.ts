import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.ASTRAOS_E2E_PORT ?? 4175)
const clerkE2eEnabled = process.env.ASTRAOS_E2E_CLERK === '1' || process.env.ASTRAOS_E2E_CLERK_JWT === '1'
const protectedSpecIgnore = ['**/*.clerk.spec.ts']

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-artifacts/e2e-results',
  timeout: 75_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: './test-artifacts/playwright-report' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: 'chromium-desktop',
      testIgnore: protectedSpecIgnore,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'chromium-mobile',
      testIgnore: protectedSpecIgnore,
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } },
    },
    ...(clerkE2eEnabled
      ? [{
          name: 'clerk-jwt',
          testMatch: '**/*.clerk.spec.ts',
          use: {
            ...devices['Desktop Chrome'],
            trace: 'off' as const,
            video: 'off' as const,
            viewport: { width: 1440, height: 960 },
          },
        }]
      : []),
  ],
})
