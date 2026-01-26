import { Link, Outlet, useNavigate } from 'react-router-dom'

import { TopNav } from './top-nav'
import { ThemeToggle } from '../theme-toggle'
import { useAuth } from '../../providers/auth'

export function PublicLayout(): JSX.Element {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItems = user
    ? user.role === 'admin'
      ? [
          { label: 'Dashboard', to: '/' },
          { label: 'Auctions', to: '/auctions' },
          { label: 'Sets', to: '/sets' },
          { label: 'Enrichment', to: '/admin/enrich' }
        ]
      : [
          { label: 'Dashboard', to: '/' },
          { label: 'Collections', to: '/collections' },
          { label: 'Sets', to: '/sets' }
        ]
    : [{ label: 'Home', to: '/' }]

  return (
    <div className="min-h-screen bg-amber-50 text-slate-900">
      <TopNav
        items={navItems}
        eyebrow="PS"
        title="Pokestats Market Lab"
        actions={
          user ? (
            <>
              <ThemeToggle />
              {user.role !== 'admin' ? (
                <button
                  type="button"
                  className="flex items-center gap-2 border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                  onClick={() => navigate('/billing')}
                >
                  Billing
                </button>
              ) : null}
              {user.role === 'admin' ? (
                <Link
                  to="/admin"
                  className="flex items-center gap-2 border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                >
                  Settings
                </Link>
              ) : null}
              <button
                type="button"
                className="flex items-center gap-2 border-2 border-slate-900 bg-rose-200 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                onClick={logout}
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="border-2 border-slate-900 bg-sky-200 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              Login
            </Link>
          )
        }
      />
      <div className="h-4 border-b-2 border-slate-900 bg-amber-100 sm:h-6 lg:h-8" />
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8 sm:pt-10 lg:pt-12">
        <Outlet />
      </main>
    </div>
  )
}
