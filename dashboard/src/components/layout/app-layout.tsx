import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { CreditCard, Home, LogOut, Settings, ShoppingBag, Sparkles, Shield } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useAuth } from '../../providers/auth'
import { cn } from '../../lib/utils'

const navLinks = [
  { to: '/app', label: 'Overview', icon: Home },
  { to: '/app/sales', label: 'Sales', icon: ShoppingBag },
  { to: '/app/settings', label: 'Settings', icon: Settings },
  { to: '/app/admin', label: 'Admin', icon: Shield },
  { to: '/billing', label: 'Billing', icon: CreditCard }
]

export function AppLayout(): JSX.Element {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const filteredNavLinks = user?.role === 'admin' ? navLinks.filter((item) => item.to !== '/billing') : navLinks

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-50">
      <aside className="hidden w-64 flex-col border-r border-slate-900/70 bg-slate-950/60 px-5 py-6 lg:flex">
        <div className="mb-8 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
              <Sparkles className="h-4 w-4" />
              PokéStats
            </div>
            <p className="text-xs text-slate-500">Tradera auctions preloaded</p>
          </div>
          <Badge
            variant={
              user?.role === 'admin'
                ? 'secondary'
                : user?.subscriptionStatus === 'active'
                  ? 'success'
                  : user?.subscriptionStatus === 'trialing'
                    ? 'secondary'
                    : 'warning'
            }
          >
            {user?.role === 'admin' ? 'admin (comped)' : user?.subscriptionStatus ?? 'guest'}
          </Badge>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {filteredNavLinks.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }: { isActive: boolean }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900',
                    isActive && 'bg-slate-900 text-slate-100 shadow-inner shadow-slate-900/70'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-6 space-y-2 text-xs text-slate-500">
          <p className="font-semibold text-slate-400">Need help?</p>
          <p>Stripe + session validation can be wired in later via the API gateway.</p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-slate-900/80 bg-slate-950/70 px-6 py-4">
          <div className="min-w-[200px] flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">{location.pathname}</div>
            <h1 className="text-lg font-semibold text-slate-50">PokéStats analytics</h1>
          </div>
          <div className="flex flex-1 items-center gap-3 lg:max-w-xl">
            <Input placeholder="Search cards, sellers, or tags" className="w-full" />
          </div>
          <div className="flex items-center gap-2">
            {user?.role !== 'admin' ? (
              <Button variant="ghost" size="sm" onClick={() => navigate('/billing')}>
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/80">
          <div className="mx-auto w-full max-w-6xl px-4 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
