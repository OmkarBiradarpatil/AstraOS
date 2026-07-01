import { createContext } from 'react'
import type { UserProfile } from '../../types/domain'

export interface AuthContextValue {
  user: UserProfile | null
  source: 'clerk' | 'local'
  isLoaded: boolean
  signIn: (profile?: Pick<UserProfile, 'email' | 'name' | 'role'>) => void
  signUp: (profile?: Pick<UserProfile, 'email' | 'name' | 'role'>) => void
  signOut: () => void
  updateProfile: (profile: Partial<Pick<UserProfile, 'name' | 'role'>>) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
