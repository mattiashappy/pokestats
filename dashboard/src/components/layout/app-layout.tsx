import { Outlet, useNavigate } from 'react-router-dom'
import { CreditCard, LogOut, Sparkles } from 'lucide-react'

import { TopNav } from './top-nav'
import { ThemeToggle } from '../theme-toggle'
import { useAuth } from '../../providers/auth'

export function AppLayout(): JSX.Element {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItems =
    user?.role === 'admin'
      ? [
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Auctions', to: '/auctions' },
          { label: 'Sets', to: '/sets' },
          { label: 'Enrichment', to: '/admin/enrich' }
        ]
      : [
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Collections', to: '/collections' },
          { label: 'Sets', to: '/sets' }
        ]

  return (
    <div className="min-h-screen bg-amber-50 text-slate-900">
      <TopNav
        items={navItems}
        actions={
          <>
            <ThemeToggle />
            {user?.role !== 'admin' ? (
              <button
                type="button"
                className="flex items-center gap-2 border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                onClick={() => navigate('/billing')}
              >
                <CreditCard className="h-4 w-4" />
                Billing
              </button>
            ) : null}
            <span className="flex items-center gap-2 border-2 border-slate-900 bg-lime-200 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a]">
              <Sparkles className="h-4 w-4" />
              {user?.role === 'admin' ? 'admin (comped)' : user?.subscriptionStatus ?? 'guest'}
            </span>
            <button
              type="button"
              className="flex items-center gap-2 border-2 border-slate-900 bg-rose-200 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
