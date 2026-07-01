import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from './useAuth'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}</span>
}

function renderProtectedRoute(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route element={<Outlet />}>
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Route>
        </Route>
        <Route path="/login" element={<><h1>Login</h1><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading surface instead of a blank screen while auth initializes', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      source: 'clerk',
      updateProfile: vi.fn(),
      user: null,
    })

    renderProtectedRoute()

    expect(screen.getByText('Preparing your workspace')).toBeInTheDocument()
    expect(screen.getByText('Checking the active session before opening protected modules.')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to login', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      source: 'clerk',
      updateProfile: vi.fn(),
      user: null,
    })

    renderProtectedRoute()

    expect(screen.getByText('Login')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('renders protected content for authenticated users', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      source: 'local',
      updateProfile: vi.fn(),
      user: {
        createdAt: '2026-06-09T00:00:00.000Z',
        email: 'user@example.com',
        id: 'user_1',
        name: 'Astra User',
        role: 'student',
      },
    })

    renderProtectedRoute()

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
