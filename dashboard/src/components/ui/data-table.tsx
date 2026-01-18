import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type DataTableProps = {
  children: ReactNode
  className?: string
}

export default function DataTable({ children, className }: DataTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto border-2 border-slate-900 bg-white shadow-[4px_4px_0px_#0f172a]">
      <table className={cn('w-full text-sm text-slate-900', className)}>{children}</table>
    </div>
  )
}
