import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CreditCard, LogOut } from 'lucide-react'

import { AppSidebar } from '../app-sidebar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SidebarProvider, SidebarTrigger } from '../ui/sidebar'
import { useAuth } from '../../providers/auth'
import { ThemeToggle } from '../theme-toggle'

export function AppLayout(): JSX.Element {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <AppSidebar />

        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm dark:border-slate-900/80 dark:bg-slate-950/70">
            <SidebarTrigger />

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
              <Badge variant={user?.subscriptionStatus === 'active' ? 'success' : 'secondary'}>
                {user?.role === 'admin' ? 'admin (comped)' : user?.subscriptionStatus ?? 'guest'}
              </Badge>
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
    </SidebarProvider>
  )
}
