import { type ComponentPropsWithoutRef } from "react"

import { cn } from "@/lib/utils"

export type TransportBadgeProps = {
  system?: string
  stationCode: string
  highlight?: string
} & ComponentPropsWithoutRef<"div">

export function TransportBadge({
  className,
  system = "PKMN",
  stationCode,
  highlight,
  ...props
}: TransportBadgeProps): JSX.Element {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-900/5 transition-shadow dark:border-slate-800/70 dark:bg-slate-900 dark:ring-slate-50/5",
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white shadow-sm dark:bg-slate-50 dark:text-slate-900">
        <span className="sr-only">System</span>
        {system}
      </span>
      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-50">
        <span className="sr-only">Set code</span>
        {stationCode}
      </span>
      {highlight ? (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900">
          {highlight}
        </span>
      ) : null}
    </div>
  )
}
