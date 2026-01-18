import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type SubscriptionStatus = 'active' | 'inactive' | 'trialing'

export type AuthUser = {
  name: string
  email: string
  subscriptionStatus: SubscriptionStatus
  trialEndsAt?: string
  cardLast4?: string
  role: 'admin' | 'member'
}

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  updateSubscription: (status: SubscriptionStatus) => void
  startTrial: (cardLast4: string) => void
  switchRole: (role: AuthUser['role']) => void
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
        const parsed: AuthUser = JSON.parse(stored)
        const parsedWithRole: AuthUser = { ...parsed, role: parsed.role ?? 'member' }

        if (parsed.subscriptionStatus === 'trialing' && parsed.trialEndsAt) {
          const trialEnd = new Date(parsed.trialEndsAt)
          const now = new Date()
          if (now >= trialEnd) {
            setUser({ ...parsedWithRole, subscriptionStatus: 'active', trialEndsAt: undefined })
            return
          }
        }

        setUser(parsedWithRole)
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
    const role = email.toLowerCase() === 'ash@pokestats.app' ? 'admin' : 'member'
    const nextUser: AuthUser = {
      name,
      email,
      subscriptionStatus: role === 'admin' ? 'active' : 'inactive',
      role
    }
    persistUser(nextUser)
  }

  const signup = async (name: string, email: string, _password: string): Promise<void> => {
    const role = email.toLowerCase() === 'ash@pokestats.app' ? 'admin' : 'member'
    const nextUser: AuthUser = {
      name: name.trim() || 'New Trainer',
      email,
      subscriptionStatus: role === 'admin' ? 'active' : 'inactive',
      role
    }
    persistUser(nextUser)
  }

  const logout = (): void => {
    persistUser(null)
  }

  const updateSubscription = (status: SubscriptionStatus): void => {
    if (!user) return
    if (user.role === 'admin') return

    const nextUser: AuthUser = {
      ...user,
      subscriptionStatus: status,
      trialEndsAt: status === 'trialing' ? user.trialEndsAt : undefined
    }
    persistUser(nextUser)
  }

  const startTrial = (cardLast4: string): void => {
    if (!user || user.role === 'admin') return

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const nextUser: AuthUser = {
      ...user,
      subscriptionStatus: 'trialing',
      trialEndsAt,
      cardLast4
    }

    persistUser(nextUser)
  }

  const switchRole = (role: AuthUser['role']): void => {
    if (!user || user.email.toLowerCase() !== 'ash@pokestats.app') return
    const nextUser: AuthUser = {
      ...user,
      role
    }
    persistUser(nextUser)
  }

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, updateSubscription, startTrial, switchRole }),
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
