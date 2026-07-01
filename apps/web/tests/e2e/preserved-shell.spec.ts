import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import AxeCore from 'axe-core'

const screenshotRoot = path.join(process.cwd(), 'test-artifacts', 'e2e-screenshots')
const viewportMatrix = [
  { name: '320', width: 320, height: 760 },
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 960 },
  { name: '1440', width: 1440, height: 960 },
  { name: '1920', width: 1920, height: 1080 },
]

type ConsoleIssue = { text: string; type: string; url?: string }

function isAllowedExternalConsoleNoise(issue: ConsoleIssue) {
  const url = issue.url ?? ''
  return (
    (/^https:\/\/t\d+\.gstatic\.com\/faviconV2/.test(url) && issue.text.includes('Failed to load resource')) ||
    (/^https:\/\/www\.youtube\.com\/s\/player\//.test(url) && issue.text.includes('compute-pressure is not allowed'))
  )
}

function captureConsole(page: Page) {
  const issues: ConsoleIssue[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location()
      const issue = { text: message.text(), type: message.type(), url: location.url || undefined }
      if (!isAllowedExternalConsoleNoise(issue)) issues.push(issue)
    }
  })
  page.on('pageerror', (error) => {
    issues.push({ text: error.message, type: 'pageerror' })
  })
  return issues
}

async function openAstraOS(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#page-landing')).toBeVisible()
  await page.waitForFunction(() => Boolean(window.AstraOSRuntime), null, { timeout: 15_000 })
}

async function switchTo(page: Page, fnName: string, selector: string) {
  await page.evaluate((name) => {
    const fn = (window as unknown as Record<string, unknown>)[name]
    if (typeof fn !== 'function') throw new Error(`Missing page switcher ${name}`)
    ;(fn as () => void)()
  }, fnName)
  await expect(page.locator(selector)).toBeVisible()
}

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth + 2)
  expect(overflow.bodyScrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth + 2)
}

async function runAccessibilitySnapshot(page: Page) {
  await page.addScriptTag({ content: AxeCore.source })
  return page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: {
        run: (context?: unknown, options?: unknown) => Promise<{
          violations: Array<{ id: string; impact?: string; nodes: unknown[] }>
        }>
      }
    }).axe
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    })
    const buttonsMissingNames = Array.from(document.querySelectorAll('button')).filter((button) =>
      !(button.textContent?.trim() || button.getAttribute('aria-label') || button.title),
    ).map((button) => button.id || button.className || button.outerHTML.slice(0, 80))
    const clickableDivs = Array.from(document.querySelectorAll('div[onclick]'))
    const unfocusableClickableDivs = clickableDivs.filter((div) =>
      !div.hasAttribute('tabindex') && !div.getAttribute('role'),
    )
    return {
      buttonsMissingNames,
      clickableDivCount: clickableDivs.length,
      headingCount: document.querySelectorAll('h1,h2,h3').length,
      criticalViolations: results.violations.filter((violation) => violation.impact === 'critical').map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      })),
      unfocusableClickableDivCount: unfocusableClickableDivs.length,
    }
  })
}

test.describe('AstraOS preserved shell reliability', () => {
  test('core user workflows are reachable without console errors', async ({ page }) => {
    const consoleIssues = captureConsole(page)
    await openAstraOS(page)

    await page.locator('.nav-cta').first().click()
    await expect(page.locator('#page-dashboard')).toBeVisible()
    await expect(page.locator('#dash-sidebar')).toBeVisible()

    await page.evaluate(() => {
      const action = (window as unknown as { pxAction?: (id: string) => void }).pxAction
      if (action) action('deadline')
      else (window as unknown as { dashOpenModal: (id: string) => void }).dashOpenModal('addDeadlineModal')
    })
    await expect(page.locator('#dl-title')).toBeVisible()
    await page.locator('#dl-title').fill('E2E release gate')
    await page.locator('#dl-date').fill('2026-06-10')
    await page.locator('#dl-subject').fill('QA')
    await page.evaluate(() => (window as unknown as { addDeadline: () => void }).addDeadline())
    await expect(page.locator('#dl-list')).toContainText('E2E release gate')

    await page.evaluate(() => (window as unknown as { dashGotoSection: (id: string) => void }).dashGotoSection('sec-bookmarks'))
    await expect(page.locator('#sec-bookmarks')).toBeVisible()
    await page.locator('#bm-url').fill('https://example.com/astraos')
    await page.locator('#bm-title').fill('AstraOS example')
    await page.evaluate(() => (window as unknown as { addBookmark: () => void }).addBookmark())
    await expect(page.locator('#bm-grid')).toContainText('AstraOS example')

    await switchTo(page, 'switchToFocusTube', '#page-focustube')
    await page.locator('#youtubeInput').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s')
    await page.evaluate(() => (window as unknown as { ft_addToQueue: () => void }).ft_addToQueue())
    await expect(page.locator('#ftQueueList')).toContainText('dQw4')
    await page.evaluate(() => (window as unknown as { ft_playNextQueued: () => void }).ft_playNextQueued())
    await expect(page.locator('#ft-sessionInterface')).toBeVisible()
    await expect(page.locator('#youtubePlayer')).toHaveAttribute('src', /dQw4w9WgXcQ/)

    await switchTo(page, 'switchToTasks', '#page-tasks')
    await expect(page.locator('#tasks-react-root')).toBeVisible()

    await switchTo(page, 'switchToHealth', '#page-health')
    await page.evaluate(() => (window as unknown as { hShowSection: (id: string, tab?: unknown, options?: unknown) => void }).hShowSection('sec-water', null, { instant: true }))
    await expect(page.locator('#waterAmount')).toBeVisible()
    await page.evaluate(() => (window as unknown as { hShowSection: (id: string, tab?: unknown, options?: unknown) => void }).hShowSection('sec-sleep', null, { instant: true }))
    await expect(page.locator('#sleepDate')).toBeVisible()
    await page.evaluate(() => (window as unknown as { hShowSection: (id: string, tab?: unknown, options?: unknown) => void }).hShowSection('sec-screen', null, { instant: true }))
    await expect(page.locator('#screenHours')).toBeVisible()

    await switchTo(page, 'switchToEntertainment', '#page-entertainment')
    await page.evaluate(() => (window as unknown as { ENT: { nav: (id: string) => void } }).ENT.nav('snake'))
    await expect(page.locator('#snake-canvas')).toBeVisible()
    await page.evaluate(() => (window as unknown as { ENT: { nav: (id: string) => void } }).ENT.nav('2048'))
    await expect(page.locator('#g2048-board')).toBeVisible()

    await switchTo(page, 'switchToSettings', '#page-settings')
    await expect(page.locator('#profile-name')).toBeVisible()
    await expect(page.locator('#pw-current')).toBeVisible()

    await switchTo(page, 'switchToDashboard', '#page-dashboard')
    await page.evaluate(() => (window as unknown as { AYNTK: { open: () => void } }).AYNTK.open())
    await expect(page.locator('#ayntk-inp')).toBeVisible()
    await expect(page.locator('#ayntk-inp')).toBeFocused()

    await switchTo(page, 'switchToVault', '#page-vault')
    await expect(page.locator('#vault-react-root')).toBeVisible()

    await expectNoDocumentOverflow(page)
    expect(consoleIssues).toEqual([])
  })

  for (const viewport of viewportMatrix) {
    test(`captures stable first viewport at ${viewport.name}px`, async ({ page }, testInfo) => {
      const consoleIssues = captureConsole(page)
      const screenshotPrefix = `${testInfo.project.name}-${viewport.name}`
      await mkdir(screenshotRoot, { recursive: true })
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openAstraOS(page)
      await expectNoDocumentOverflow(page)
      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotRoot, `${screenshotPrefix}-landing.png`),
      })

      await switchTo(page, 'switchToDashboard', '#page-dashboard')
      await expectNoDocumentOverflow(page)
      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotRoot, `${screenshotPrefix}-dashboard.png`),
      })

      await switchTo(page, 'switchToFocusTube', '#page-focustube')
      await expectNoDocumentOverflow(page)
      await page.screenshot({
        fullPage: false,
        path: path.join(screenshotRoot, `${screenshotPrefix}-focustube.png`),
      })

      expect(consoleIssues).toEqual([])
    })
  }

  test('accessibility smoke reports actionable preserved-shell risks', async ({ page }, testInfo) => {
    await openAstraOS(page)
    await switchTo(page, 'switchToDashboard', '#page-dashboard')
    const snapshot = await runAccessibilitySnapshot(page)
    await testInfo.attach('accessibility-snapshot', {
      body: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    })

    expect(snapshot.buttonsMissingNames).toEqual([])
    expect(snapshot.headingCount).toBeGreaterThan(0)
    expect(snapshot.criticalViolations).toEqual([])
  })
})
