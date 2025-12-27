import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type SubscriptionStatus = 'active' | 'inactive'

export type AuthUser = {
  name: string
  email: string
  subscriptionStatus: SubscriptionStatus
}

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  updateSubscription: (status: SubscriptionStatus) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const STORAGE_KEY = 'pokestats-auth-user'

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch (error) {
        console.error('Failed to parse auth state', error)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const persistUser = (nextUser: AuthUser | null): void => {
    setUser(nextUser)
    if (nextUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const login = async (email: string, _password: string): Promise<void> => {
    const baseName = email.split('@')[0]
    const name = baseName ? `${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}` : 'Trainer'
    const nextUser: AuthUser = {
      name,
      email,
      subscriptionStatus: 'inactive'
    }
    persistUser(nextUser)
  }

  const signup = async (name: string, email: string, _password: string): Promise<void> => {
    const nextUser: AuthUser = {
      name: name.trim() || 'New Trainer',
      email,
      subscriptionStatus: 'inactive'
    }
    persistUser(nextUser)
  }

  const logout = (): void => {
    persistUser(null)
  }

  const updateSubscription = (status: SubscriptionStatus): void => {
    if (!user) return
    const nextUser = { ...user, subscriptionStatus: status }
    persistUser(nextUser)
  }

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, updateSubscription }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
