import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth, type AuthUser } from '../providers/auth'

type ProtectedRouteProps = {
  requireSubscription?: boolean
  allowedRoles?: AuthUser['role'][]
}

export function ProtectedRoute({ requireSubscription = false, allowedRoles }: ProtectedRouteProps): JSX.Element {
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

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const hasAccess =
    user.role === 'admin' || user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing'

  if (requireSubscription && !hasAccess) {
    return <Navigate to="/billing" replace />
  }

  return <Outlet />
}
