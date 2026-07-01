import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="center-screen">
      <div>
        <p className="eyebrow">404</p>
        <h1>That route is outside the system map.</h1>
        <p className="lede">Return to mission control and keep the rebuild moving.</p>
        <Link className="btn primary" to="/dashboard">
          Open dashboard
        </Link>
      </div>
    </main>
  )
}
