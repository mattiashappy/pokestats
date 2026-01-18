import { Link, Outlet } from 'react-router-dom'

import { TopNav } from './top-nav'

export function PublicLayout(): JSX.Element {
  const navItems = [
    { label: 'Dashboard', to: '/' },
    { label: 'Auctions', to: '/auctions' },
    { label: 'Sets', to: '/sets' },
    { label: 'Enrichment', to: '/admin/enrich' }
  ]

  return (
    <div className="min-h-screen bg-amber-50 text-slate-900">
      <TopNav
        items={navItems}
        eyebrow="PS"
        title="Pokestats Market Lab"
        actions={
          <>
            <Link
              to="/admin"
              className="border-2 border-slate-900 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              Admin
            </Link>
            <Link
              to="/login"
              className="border-2 border-slate-900 bg-sky-200 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              Logout
            </Link>
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
