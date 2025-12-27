import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../providers/auth'

export function ProtectedRoute({ requireSubscription = false }: { requireSubscription?: boolean }): JSX.Element {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p className="text-sm text-slate-400">Loading session…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  const hasAccess =
    user.role === 'admin' || user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing'

  if (requireSubscription && !hasAccess) {
    return <Navigate to="/billing" replace />
  }

  return <Outlet />
}
