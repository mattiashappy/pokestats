import { useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, ChevronsLeft, ChevronsRight, CreditCard, Filter, Languages, LogOut, Medal, Settings, Shield, Star, Table } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { useAuth } from '../../providers/auth'
import { cn } from '../../lib/utils'
import { ThemeToggle } from '../theme-toggle'

const navLinks = [
  { to: '/app/auctions', label: 'Pokémon', icon: Table },
  { to: '/app/attributes/era', label: 'Eras', icon: BarChart3 },
  { to: '/app/attributes/grading', label: 'Grading companies', icon: Medal },
  { to: '/app/attributes/language', label: 'Languages', icon: Languages },
  { to: '/app/attributes/grade', label: 'Grades', icon: Star },
  { to: '/app/settings', label: 'Settings', icon: Settings },
  { to: '/app/admin', label: 'Admin', icon: Shield },
  { to: '/billing', label: 'Billing', icon: CreditCard }
]

export function AppLayout(): JSX.Element {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const filteredNavLinks = user?.role === 'admin' ? navLinks.filter((item) => item.to !== '/billing') : navLinks

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <aside
        className={cn(
          'hidden flex-col border-r border-slate-200 bg-white py-6 shadow-sm transition-all duration-200 dark:border-slate-900/70 dark:bg-slate-950/60 lg:flex',
          isCollapsed ? 'w-20 px-3' : 'w-64 px-5'
        )}
      >
        <div className={cn('mb-8 flex items-center justify-between', isCollapsed && 'flex-col gap-4')}> 
          <div className={cn('space-y-1', isCollapsed && 'text-center')}> 
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-300">
              <Filter className="h-4 w-4" />
              <span className={cn('transition-all', isCollapsed && 'sr-only')}>Pokémon</span>
            </div>
            <p className={cn('text-xs text-slate-500 dark:text-slate-500', isCollapsed && 'hidden')}>Ended auction intelligence workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setIsCollapsed((prev) => !prev)} aria-label="Toggle sidebar">
              {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
            <Badge
              className={cn(isCollapsed && 'hidden')}
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
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
                    isActive && 'bg-slate-100 text-slate-900 shadow-inner shadow-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:shadow-slate-900/70',
                    isCollapsed && 'justify-center'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span className={cn('transition-all', isCollapsed && 'hidden')}>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className={cn('mt-6 space-y-2 text-xs text-slate-500', isCollapsed && 'hidden')}>
          <p className="font-semibold text-slate-600 dark:text-slate-400">Filtering is the product.</p>
          <p>Saved views, alerts, and bidding links live here—no SaaS KPI clutter.</p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-900/80 dark:bg-slate-950/70">
          <div className="min-w-[200px] flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">{location.pathname}</div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Pokémon auctions</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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

        <main className="flex-1 bg-slate-50 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80">
          <div className="mx-auto w-full max-w-6xl px-4 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
