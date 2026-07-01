import { ASTRAOS_PAGE_REGISTRY } from './pageRegistry'
import { readAstraLocalSnapshot } from './storage'

export interface PageDiagnostic {
  key: string
  title: string
  elementId: string
  present: boolean
  visible: boolean
  switcherName: string
  switcherDefined: boolean
  missingSelectors: string[]
}

export interface DuplicateIdDiagnostic {
  id: string
  count: number
}

export interface ButtonDiagnostic {
  total: number
  missingAction: number
  missingLabel: number
  missingActionLabels: string[]
  missingLabelSelectors: string[]
}

export interface AstraDomDiagnostics {
  pages: PageDiagnostic[]
  buttons: ButtonDiagnostic
  duplicateIds: DuplicateIdDiagnostic[]
  forms: {
    total: number
    unnamedInputs: number
  }
  storage: {
    entryCount: number
    byteSize: number
  }
}

function hasButtonAction(button: HTMLButtonElement) {
  return Boolean(button.getAttribute('onclick') || button.type === 'submit' || button.closest('form'))
}

function buttonLabel(button: HTMLButtonElement) {
  return button.textContent?.trim() || button.getAttribute('aria-label') || button.title || button.id || button.className || 'unlabeled-button'
}

function elementSelector(element: Element) {
  if (element.id) return `#${element.id}`
  const tag = element.tagName.toLowerCase()
  const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''
  const own = className ? `${tag}.${className}` : tag
  const parent = element.parentElement
  if (!parent) return own
  if (parent.id) return `#${parent.id} > ${own}`
  const parentClass = typeof parent.className === 'string' ? parent.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''
  return parentClass ? `${parent.tagName.toLowerCase()}.${parentClass} > ${own}` : own
}

function scriptText(documentRef: Document) {
  return Array.from(documentRef.scripts).map((script) => script.textContent ?? '').join('\n')
}

function hasSwitcher(documentRef: Document, switcherName: string) {
  const scripts = scriptText(documentRef)
  const escaped = switcherName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:function\\s+${escaped}\\s*\\(|window\\.${escaped}\\s*=)`).test(scripts)
}

function duplicateIds(documentRef: Document): DuplicateIdDiagnostic[] {
  const counts = new Map<string, number>()
  documentRef.querySelectorAll('[id]').forEach((element) => {
    const id = element.id.trim()
    if (!id) return
    counts.set(id, (counts.get(id) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
}

export function collectDomDiagnostics(
  documentRef: Document = document,
  storage: Storage = window.localStorage,
): AstraDomDiagnostics {
  const pages = ASTRAOS_PAGE_REGISTRY.map((page) => {
    const element = documentRef.getElementById(page.elementId)
    return {
      key: page.key,
      title: page.title,
      elementId: page.elementId,
      present: Boolean(element),
      visible: Boolean(element && getComputedStyle(element).display !== 'none'),
      switcherName: page.switcherName,
      switcherDefined: hasSwitcher(documentRef, page.switcherName),
      missingSelectors: page.criticalSelectors.filter((selector) => !documentRef.querySelector(selector)),
    }
  })

  const buttons = Array.from(documentRef.querySelectorAll('button'))
  const missingActionButtons = buttons.filter((button) => !hasButtonAction(button))
  const missingLabelButtons = buttons.filter((button) => !(button.textContent?.trim() || button.getAttribute('aria-label') || button.title))
  const formControls = Array.from(documentRef.querySelectorAll('form input, form textarea, form select'))
  const snapshot = readAstraLocalSnapshot(storage)

  return {
    pages,
    buttons: {
      total: buttons.length,
      missingAction: missingActionButtons.length,
      missingLabel: missingLabelButtons.length,
      missingActionLabels: missingActionButtons.slice(0, 12).map(buttonLabel),
      missingLabelSelectors: missingLabelButtons.slice(0, 12).map(elementSelector),
    },
    duplicateIds: duplicateIds(documentRef),
    forms: {
      total: documentRef.forms.length,
      unnamedInputs: formControls.filter((control) => !control.getAttribute('name') && !control.id).length,
    },
    storage: {
      entryCount: snapshot.entryCount,
      byteSize: snapshot.byteSize,
    },
  }
}
