import * as React from 'react'
import { ChevronLeft, PanelRightOpen } from 'lucide-react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '../../lib/utils'

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

interface SidebarProviderProps {
  children: React.ReactNode
  defaultOpen?: boolean
}

function SidebarProvider({ children, defaultOpen = true }: SidebarProviderProps): JSX.Element {
  const [collapsed, setCollapsed] = React.useState(!defaultOpen)

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      toggle: () => setCollapsed((previous) => !previous)
    }),
    [collapsed]
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  collapsible?: 'icon' | 'none'
}

function Sidebar({ className, children, collapsible = 'none', ...props }: SidebarProps): JSX.Element {
  const { collapsed } = useSidebar()

  return (
    <div
      data-collapsible={collapsible}
      data-collapsed={collapsed}
      className={cn(
        'group/sidebar relative hidden h-screen border-r border-slate-200 bg-white shadow-sm transition-all duration-200 dark:border-slate-900/70 dark:bg-slate-950/60 lg:flex',
        collapsed ? 'w-[72px]' : 'w-64',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex flex-1 flex-col gap-6 px-3 py-6', className)} {...props} />
}

function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('space-y-3', className)} {...props} />
}

function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('px-2 text-xs font-semibold uppercase tracking-wide text-slate-500', className)} {...props} />
}

function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('space-y-1', className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('rounded-xl transition hover:bg-slate-50 dark:hover:bg-slate-900/40', className)} {...props} />
}

interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  tooltip?: string
  isActive?: boolean
}

function SidebarMenuButton({ className, asChild, children, isActive, tooltip, type = 'button', ...props }: SidebarMenuButtonProps): JSX.Element {
  const { collapsed } = useSidebar()
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900/60',
        isActive && 'bg-slate-100 text-slate-900 shadow-inner shadow-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:shadow-slate-900/70',
        collapsed && 'justify-center',
        className
      )}
      title={tooltip}
      type={type}
      {...props}
    >
      {children}
    </Comp>
  )
}

function SidebarMenuSub({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('space-y-1 border-l border-slate-200 pl-4 dark:border-slate-800', className)} {...props} />
}

function SidebarMenuSubItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('rounded-lg transition hover:bg-slate-50 dark:hover:bg-slate-900/40', className)} {...props} />
}

interface SidebarMenuSubButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  isActive?: boolean
}

function SidebarMenuSubButton({ asChild, className, children, isActive, type = 'button', ...props }: SidebarMenuSubButtonProps): JSX.Element {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900/60',
        isActive && 'bg-slate-100 text-slate-900 shadow-inner shadow-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:shadow-slate-900/70',
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </Comp>
  )
}

function SidebarRail({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const { collapsed, toggle } = useSidebar()

  return (
    <div
      className={cn(
        'absolute right-[-16px] top-6 hidden h-9 w-8 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 dark:border-slate-900/70 dark:bg-slate-950/80 lg:flex',
        className
      )}
      {...props}
    >
      <button
        type="button"
        className="flex h-full w-full items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-200"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </div>
  )
}

function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const { toggle } = useSidebar()

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900',
        className
      )}
      onClick={toggle}
      aria-label="Toggle sidebar"
      {...props}
    >
      <PanelRightOpen className="h-4 w-4" />
    </button>
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
}
