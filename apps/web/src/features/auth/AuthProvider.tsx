import { useAuth as useClerkSession, useClerk, useUser } from '@clerk/clerk-react'
import { type PropsWithChildren, useEffect, useMemo } from 'react'
import { apiClient, setApiTokenProvider } from '../../lib/api/apiClient'
import { usePersistentState } from '../../lib/storage/usePersistentState'
import type { UserProfile } from '../../types/domain'
import { AuthContext, type AuthContextValue } from './authContext'

type AuthProviderMode = 'clerk' | 'local'

function normalizeRole(value: unknown): UserProfile['role'] {
  return value === 'parent' || value === 'teacher' || value === 'admin' ? value : 'student'
}

function LocalAuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = usePersistentState<UserProfile | null>('astraos.session', null)

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      source: 'local',
      isLoaded: true,
      signIn: (profile) => {
        if (!profile) return
        setUser({
          ...profile,
          id: `local_${profile.email.toLowerCase()}`,
          createdAt: new Date().toISOString(),
        })
      },
      signUp: (profile) => {
        if (!profile) return
        setUser({
          ...profile,
          id: `local_${profile.email.toLowerCase()}`,
          createdAt: new Date().toISOString(),
        })
      },
      signOut: () => setUser(null),
      updateProfile: (profile) => {
        setUser((current) => (current ? { ...current, ...profile } : current))
      },
    }),
    [setUser, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function ClerkAuthProvider({ children }: PropsWithChildren) {
  const clerk = useClerk()
  const { getToken } = useClerkSession()
  const { isLoaded, isSignedIn, user } = useUser()
  const profile = useMemo<UserProfile | null>(() => {
    const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? ''
    return isLoaded && isSignedIn && user
      ? {
        id: user.id,
        name: user.fullName || user.firstName || primaryEmail || 'AstraOS User',
        email: primaryEmail,
        role: normalizeRole(user.publicMetadata.role),
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
      }
      : null
  }, [isLoaded, isSignedIn, user])

  useEffect(() => {
    setApiTokenProvider(() => getToken())
    return () => setApiTokenProvider(null)
  }, [getToken])

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !apiClient.canUseProtectedApi()) return
    void apiClient.get('/users/me', { retries: 0 }).catch(() => {
      // Profile sync is best-effort; feature API calls will surface actionable errors.
    })
  }, [isLoaded, isSignedIn, user?.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: profile,
      source: 'clerk',
      isLoaded,
      signIn: () => {
        void clerk.openSignIn()
      },
      signUp: () => {
        void clerk.openSignUp()
      },
      signOut: () => {
        void clerk.signOut()
      },
      updateProfile: (patch) => {
        if (!user) return
        if (patch.name) void user.update({ firstName: patch.name })
      },
    }),
    [clerk, isLoaded, profile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children, mode = 'local' }: PropsWithChildren<{ mode?: AuthProviderMode }>) {
  if (mode === 'clerk') return <ClerkAuthProvider>{children}</ClerkAuthProvider>
  return <LocalAuthProvider>{children}</LocalAuthProvider>
}
