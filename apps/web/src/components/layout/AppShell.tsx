import {
  Activity,
  Archive,
  Clapperboard,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Menu,
  MonitorPlay,
  Settings,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../ui/Button'
import { useAuth } from '../../features/auth/useAuth'
import { useCloudReadiness } from '../../features/auth/cloudReadiness'
import { useUiStore } from '../../store/useUiStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/focustube', label: 'FocusTube', icon: MonitorPlay },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/vault', label: 'Vault', icon: Archive },
  { to: '/entertainment', label: 'Entertainment', icon: Clapperboard },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const pageTitles: Record<string, string> = {
  '/dashboard': 'Mission Control',
  '/tasks': 'Focus Engine',
  '/focustube': 'FocusTube',
  '/health': 'Health Optimization',
  '/vault': 'Vault',
  '/entertainment': 'Entertainment Hub',
  '/settings': 'Settings',
}

export function AppShell() {
  const { signOut, user } = useAuth()
  const cloud = useCloudReadiness()
  const location = useLocation()
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useUiStore()
  const pageTitle = pageTitles[location.pathname] ?? 'AstraOS'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <NavLink to="/dashboard" className="brand" onClick={() => setSidebarOpen(false)}>
            <span className="brand-mark small">
              <Activity size={19} />
            </span>
            <span>
              <strong>AstraOS</strong>
              <small>Enterprise rebuild</small>
            </span>
          </NavLink>
          <button
            aria-label="Close navigation"
            className="icon-button mobile-only"
            type="button"
            onClick={toggleSidebar}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <span>{user?.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role}</small>
            </div>
          </div>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button
            aria-label="Open navigation"
            className="icon-button mobile-only"
            type="button"
            onClick={toggleSidebar}
          >
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">AstraOS</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-status">
            <span className="status-dot" />
            {cloud.ready ? 'Cloud sync ready' : cloud.apiConfigured ? 'Cloud auth pending' : 'Local bridge mode'}
          </div>
        </header>
        <main className="page-container">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <button
          aria-label="Close navigation overlay"
          className="scrim"
          type="button"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
