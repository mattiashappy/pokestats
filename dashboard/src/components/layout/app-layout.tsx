import { Link, Outlet, useNavigate } from 'react-router-dom'
import { CreditCard, LogOut, Settings, Sparkles } from 'lucide-react'

import { TopNav } from './top-nav'
import { ThemeToggle } from '../theme-toggle'
import { useAuth } from '../../providers/auth'

export function AppLayout(): JSX.Element {
  const { user, logout, switchRole } = useAuth()
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
            {user?.role === 'admin' ? (
              <Link
                to="/admin"
                className="flex items-center gap-2 border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            ) : null}
            <div className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-lime-200 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a]">
              <Sparkles className="h-4 w-4" />
              {user?.role === 'admin' ? 'admin' : user?.subscriptionStatus ?? 'guest'}
            </div>
            {user?.email === 'ash@pokestats.app' ? (
              <div className="flex items-center overflow-hidden rounded-full border-2 border-slate-900 bg-white text-[11px] font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a]">
                <button
                  type="button"
                  className={`px-3 py-2 transition ${
                    user.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                  }`}
                  onClick={() => switchRole('admin')}
                >
                  Admin
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 transition ${
                    user.role === 'member' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                  }`}
                  onClick={() => switchRole('member')}
                >
                  User
                </button>
              </div>
            ) : null}
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
