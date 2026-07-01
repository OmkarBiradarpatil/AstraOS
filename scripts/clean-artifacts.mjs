import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')

const targets = [
  'apps/web/test-artifacts',
  'apps/web/playwright-report',
  'apps/web/test-results',
  'apps/web/blob-report',
  'backend/test-artifacts',
  'backend/test-results',
  'test-artifacts',
  'playwright-report',
  'test-results',
  'blob-report',
]

const providerReportDirs = ['.', 'backend', 'apps/web']

function insideWorkspace(target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function removeTarget(target) {
  const resolved = path.resolve(root, target)
  if (!insideWorkspace(resolved)) {
    throw new Error(`Refusing to remove outside workspace: ${resolved}`)
  }
  if (!(await exists(resolved))) return
  if (dryRun) {
    console.log(`[dry-run] remove ${path.relative(root, resolved)}`)
    return
  }
  await rm(resolved, { recursive: true, force: true })
  console.log(`removed ${path.relative(root, resolved)}`)
}

for (const target of targets) {
  await removeTarget(target)
}

for (const directory of providerReportDirs) {
  const resolvedDir = path.resolve(root, directory)
  if (!insideWorkspace(resolvedDir) || !(await exists(resolvedDir))) continue
  const entries = await readdir(resolvedDir)
  for (const entry of entries) {
    if (/^provider-smoke-report.*\.json$/i.test(entry)) {
      await removeTarget(path.join(directory, entry))
    }
  }
}

if (dryRun) {
  console.log('Artifact cleanup dry run complete.')
}
