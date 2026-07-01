import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectDomDiagnostics } from './diagnostics'
import { ASTRAOS_PAGE_REGISTRY } from './pageRegistry'

function loadPreservedHtmlDocument() {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
  const htmlDocument = document.implementation.createHTMLDocument('AstraOS preserved shell')
  htmlDocument.documentElement.innerHTML = html
  return htmlDocument
}

describe('collectDomDiagnostics', () => {
  it('reports page and button health without mutating the DOM', () => {
    document.body.innerHTML = `
      <script>function switchToLanding(){} function switchToDashboard(){}</script>
      <section id="page-landing" style="display:block"><h1 class="hero-title">AstraOS</h1><button class="nav-cta" onclick="switchToDashboard()">Join</button></section>
      <section id="page-dashboard" style="display:none"><div id="live-clock"></div><div id="stat-deadlines"></div><div id="dash-sidebar"></div></section>
      <button title="Icon only" onclick="noop()"></button>
    `

    const diagnostics = collectDomDiagnostics(document, localStorage)

    expect(diagnostics.pages.find((page) => page.key === 'landing')?.present).toBe(true)
    expect(diagnostics.pages.find((page) => page.key === 'focustube')?.present).toBe(false)
    expect(diagnostics.buttons.total).toBe(2)
    expect(diagnostics.buttons.missingAction).toBe(0)
    expect(diagnostics.buttons.missingActionLabels).toEqual([])
    expect(diagnostics.duplicateIds).toEqual([])
  })

  it('keeps the preserved HTML shell aligned with the registered page contract', () => {
    const htmlDocument = loadPreservedHtmlDocument()
    const diagnostics = collectDomDiagnostics(htmlDocument, localStorage)

    expect(diagnostics.pages).toHaveLength(ASTRAOS_PAGE_REGISTRY.length)
    expect(diagnostics.pages.filter((page) => !page.present)).toEqual([])
    expect(diagnostics.pages.filter((page) => !page.switcherDefined)).toEqual([])
    expect(diagnostics.pages.flatMap((page) => page.missingSelectors.map((selector) => `${page.key}:${selector}`))).toEqual([])
    expect(diagnostics.duplicateIds).toEqual([])
    expect(diagnostics.buttons.total).toBeGreaterThan(80)
    expect(diagnostics.buttons.missingLabelSelectors).toEqual([])
  })
})
