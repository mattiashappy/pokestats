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
  updateSubscription: (status: SubscriptionStatus) => Promise<void>
  startTrial: (cardLast4: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const API_HEADERS = {
  'Content-Type': 'application/json'
}

const parseError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json()
    return payload?.error ? String(payload.error) : response.statusText
  } catch (error) {
    return response.statusText
  }
}

const requestAuth = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      ...API_HEADERS,
      ...(options?.headers ?? {})
    },
    ...options
  })
  if (!response.ok) {
    const message = await parseError(response)
    throw new Error(message || 'Authentication failed')
  }
  return response.json() as Promise<T>
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadSession = async (): Promise<void> => {
      try {
        const payload = await requestAuth<{ user: AuthUser | null }>('/api/auth/session')
        if (isMounted) {
          setUser(payload.user)
        }
      } catch (error) {
        console.error('Failed to load session', error)
        if (isMounted) {
          setUser(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void loadSession()

    return () => {
      isMounted = false
    }
  }, [])

  const login = async (email: string, password: string): Promise<void> => {
    const payload = await requestAuth<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    setUser(payload.user)
  }

  const signup = async (name: string, email: string, _password: string): Promise<void> => {
    const payload = await requestAuth<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email })
    })
    setUser(payload.user)
  }

  const logout = (): void => {
    void requestAuth('/api/auth/logout', { method: 'POST' }).finally(() => {
      setUser(null)
    })
  }

  const updateSubscription = async (status: SubscriptionStatus): Promise<void> => {
    if (!user || user.role === 'admin') return
    const payload = await requestAuth<{ user: AuthUser }>('/api/auth/subscription', {
      method: 'POST',
      body: JSON.stringify({ status })
    })
    setUser(payload.user)
  }

  const startTrial = async (cardLast4: string): Promise<void> => {
    if (!user || user.role === 'admin') return
    const payload = await requestAuth<{ user: AuthUser }>('/api/auth/trial', {
      method: 'POST',
      body: JSON.stringify({ cardLast4 })
    })
    setUser(payload.user)
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
