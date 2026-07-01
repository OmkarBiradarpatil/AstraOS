import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export function ProtectedRoute() {
  const { isLoaded, user } = useAuth()
  const location = useLocation()

  if (!isLoaded) {
    return (
      <main className="auth-screen" aria-busy="true">
        <section className="auth-panel">
          <p className="eyebrow">AstraOS</p>
          <h1>Preparing your workspace</h1>
          <p className="lede">Checking the active session before opening protected modules.</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
