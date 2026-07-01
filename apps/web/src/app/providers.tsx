import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'
import { AuthProvider } from '../features/auth/AuthProvider'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const productionConfigMissing = import.meta.env.PROD && (!clerkPublishableKey || !apiBaseUrl)

function ProductionConfigurationError() {
  return (
    <main className="auth-screen">
      <section className="auth-panel" role="alert">
        <p className="eyebrow">Configuration Required</p>
        <h1>AstraOS production auth is not ready</h1>
        <p className="lede">
          Configure `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL` before launching the production web app.
        </p>
      </section>
    </main>
  )
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  )

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {productionConfigMissing ? (
            <ProductionConfigurationError />
          ) : clerkPublishableKey ? (
            <ClerkProvider publishableKey={clerkPublishableKey}>
              <AuthProvider mode="clerk">{children}</AuthProvider>
            </ClerkProvider>
          ) : (
            <AuthProvider mode="local">{children}</AuthProvider>
          )}
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
