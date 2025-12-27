import * as React from 'react'

import { cn } from '../../lib/utils'

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-inner transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100 dark:focus-visible:ring-offset-slate-950',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = 'Select'

export { Select }
