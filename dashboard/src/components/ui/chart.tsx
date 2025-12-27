import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { createContext, useContext, useId } from 'react'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { Tooltip } from 'recharts'
import type { TooltipProps } from 'recharts'

import { cn } from '../../lib/utils'

type ChartContextType = {
  config: ChartConfig
  id: string
}

const ChartContext = createContext<ChartContextType | null>(null)

export type ChartConfig = Record<string, { label?: string; color?: string }>

interface ChartContainerProps extends HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
  children: ReactNode
}

export function ChartContainer({ config, className, children, ...props }: ChartContainerProps): JSX.Element {
  const id = useId()

  const chartColors = Object.fromEntries(
    Object.entries(config).map(([key, value], index) => {
      const color = value.color ?? `hsl(var(--chart-${index + 1}))`
      return [`--color-${key}`, color]
    })
  )

  return (
    <div
      className={cn('flex h-full w-full flex-1 items-center justify-center text-xs', className)}
      style={chartColors as CSSProperties}
      {...props}
    >
      <ChartContext.Provider value={{ config, id }}>{children}</ChartContext.Provider>
    </div>
  )
}

export function useChartConfig(): ChartContextType {
  const context = useContext(ChartContext)

  if (!context) {
    throw new Error('useChartConfig must be used within a ChartContainer')
  }

  return context
}

interface ChartTooltipProps extends TooltipProps<ValueType, NameType> {}

export function ChartTooltip(props: ChartTooltipProps): JSX.Element {
  return <Tooltip {...props} wrapperStyle={{ outline: 'none' }} />
}

interface ChartTooltipContentProps extends TooltipProps<ValueType, NameType> {}

export function ChartTooltipContent({ active, payload, label }: ChartTooltipContentProps): JSX.Element | null {
  const { config } = useChartConfig()

  if (!active || !payload?.length) return null

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-800 dark:bg-slate-900">
      {label ? <div className="mb-1 font-semibold text-slate-900 dark:text-slate-50">{label}</div> : null}
      <div className="flex flex-col gap-1">
        {payload.map((item) => {
          const name = typeof item.name === 'string' ? item.name : String(item.name)
          const valueLabel = config[name]?.label ?? name
          const color = item.color ?? config[name]?.color ?? 'hsl(var(--chart-1))'

          return (
            <div key={`${name}-${item.dataKey}`} className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{valueLabel}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-50">
                {typeof item.value === 'number' ? item.value.toLocaleString('sv-SE') : item.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
