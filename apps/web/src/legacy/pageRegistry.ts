export const ASTRAOS_PAGE_REGISTRY = [
  {
    key: 'landing',
    title: 'Landing',
    elementId: 'page-landing',
    switcherName: 'switchToLanding',
    criticalSelectors: ['.hero-title', '.nav-cta'],
  },
  {
    key: 'dashboard',
    title: 'Dashboard',
    elementId: 'page-dashboard',
    switcherName: 'switchToDashboard',
    criticalSelectors: ['#live-clock', '#stat-deadlines', '#dash-sidebar'],
  },
  {
    key: 'focustube',
    title: 'FocusTube',
    elementId: 'page-focustube',
    switcherName: 'switchToFocusTube',
    criticalSelectors: ['#youtubeInput', '#youtubePlayer', '#notesContainer'],
  },
  {
    key: 'tasks',
    title: 'Focus Engine',
    elementId: 'page-tasks',
    switcherName: 'switchToTasks',
    criticalSelectors: ['#tasks-react-root'],
  },
  {
    key: 'settings',
    title: 'Settings',
    elementId: 'page-settings',
    switcherName: 'switchToSettings',
    criticalSelectors: ['#profile-name', '#pw-current', '#reset-btn'],
  },
  {
    key: 'health',
    title: 'Health & Mind',
    elementId: 'page-health',
    switcherName: 'switchToHealth',
    criticalSelectors: ['#waterAmount', '#sleepDate', '#screenHours'],
  },
  {
    key: 'vault',
    title: 'AI Vault',
    elementId: 'page-vault',
    switcherName: 'switchToVault',
    criticalSelectors: ['#vault-react-root'],
  },
  {
    key: 'entertainment',
    title: 'Entertainment',
    elementId: 'page-entertainment',
    switcherName: 'switchToEntertainment',
    criticalSelectors: ['#anime-list', '#snake-canvas', '#g2048-board'],
  },
] as const

export type AstraOSPage = (typeof ASTRAOS_PAGE_REGISTRY)[number]
export type AstraOSPageKey = AstraOSPage['key']

export function getAstraOSPage(key: string) {
  return ASTRAOS_PAGE_REGISTRY.find((page) => page.key === key) ?? null
}

export function listAstraOSPageIds() {
  return ASTRAOS_PAGE_REGISTRY.map((page) => page.elementId)
}
