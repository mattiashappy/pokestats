import * as React from 'react'

import { cn } from '../../lib/utils'

function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>): JSX.Element {
  return (
    <div className="relative w-full overflow-auto rounded-lg border border-slate-800">
      <table className={cn('w-full caption-bottom text-sm text-slate-100', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-slate-800', className)} {...props} />
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <tbody className={cn('[&_tr:last-child]:border-0 [&_tr]:border-b [&_tr]:border-slate-900', className)} {...props} />
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return <tr className={cn('transition-colors hover:bg-slate-900/60', className)} {...props} />
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      className={cn(
        'bg-slate-900/80 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <td className={cn('px-4 py-3 align-middle text-sm text-slate-100', className)} {...props} />
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow }
