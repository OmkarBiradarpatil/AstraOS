import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AstraOS] Unhandled UI error', { error, info })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <main className="fatal-screen">
        <div>
          <p className="eyebrow">System recovery</p>
          <h1>AstraOS hit a recoverable UI fault.</h1>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </div>
      </main>
    )
  }
}
