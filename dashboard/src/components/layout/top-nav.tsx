import { NavLink } from 'react-router-dom'

import { cn } from '../../lib/utils'

export type TopNavItem = {
  label: string
  to: string
}

type TopNavProps = {
  items: TopNavItem[]
  actions?: React.ReactNode
  eyebrow?: string
  title?: string
}

export function TopNav({ items, actions, eyebrow = 'PokéStats', title = 'Market Lab' }: TopNavProps): JSX.Element {
  return (
    <div className="border-b-4 border-slate-900 bg-amber-200">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center border-2 border-slate-900 bg-white text-lg font-black shadow-[3px_3px_0px_#0f172a]">
            PS
          </div>
          <div className="leading-tight">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{eyebrow}</p>
            <p className="text-lg font-black text-slate-900">{title}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-wrap items-center justify-center gap-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'border-2 border-slate-900 bg-white px-3 py-2 text-sm font-semibold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white',
                  isActive && 'bg-slate-900 text-white'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
