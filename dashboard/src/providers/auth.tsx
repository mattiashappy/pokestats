import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { registeredUsers } from '../data/users'

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const STORAGE_KEY = 'pokestats-auth-user'
const ADMIN_EMAIL = import.meta.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ''
const ADMIN_PASS = import.meta.env.ADMIN_PASS ?? ''
const MEMBER_PASS = import.meta.env.MEMBER_PASS ?? ''
const SELF_SIGNUP_ENABLED = import.meta.env.SELF_SIGNUP_ENABLED === 'true'

export const isAdminLogin = (email: string, password: string): boolean => {
  if (!ADMIN_EMAIL || !ADMIN_PASS) return false
  return email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASS
}

const matchesAdminEmail = (email: string): boolean => {
  if (!ADMIN_EMAIL) return false
  return email.trim().toLowerCase() === ADMIN_EMAIL
}

const findRegisteredUser = (email: string): (typeof registeredUsers)[number] | null => {
  const normalized = email.trim().toLowerCase()
  return registeredUsers.find((user) => user.email.trim().toLowerCase() === normalized) ?? null
}

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

  const login = async (email: string, password: string): Promise<void> => {
    const baseName = email.split('@')[0]
    const name = baseName ? `${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}` : 'Trainer'
    if (matchesAdminEmail(email) && ADMIN_PASS && password !== ADMIN_PASS) {
      throw new Error('Invalid admin credentials')
    }
    const isAdmin = isAdminLogin(email, password)
    if (!isAdmin) {
      if (!MEMBER_PASS) {
        throw new Error('Member login is disabled until MEMBER_PASS is configured')
      }
      if (password !== MEMBER_PASS) {
        throw new Error('Invalid member credentials')
      }
    }
    const registeredUser = isAdmin ? null : findRegisteredUser(email)
    if (!isAdmin && !registeredUser) {
      throw new Error('Account not found. Contact an administrator to request access.')
    }
    const role = isAdmin ? 'admin' : 'member'
    const nextUser: AuthUser = {
      name: registeredUser?.name ?? name,
      email,
      subscriptionStatus: role === 'admin' ? 'active' : (registeredUser?.subscriptionStatus ?? 'inactive'),
      trialEndsAt: registeredUser?.trialEndsAt,
      role
    }
    persistUser(nextUser)
  }

  const signup = async (name: string, email: string, _password: string): Promise<void> => {
    if (!SELF_SIGNUP_ENABLED) {
      throw new Error('Self-service signup is disabled. Contact an administrator to request access.')
    }
    const role = 'member'
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

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, updateSubscription, startTrial }),
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
