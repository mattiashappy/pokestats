import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Loader2 } from 'lucide-react'

import { Button } from '../components/ui/button'
import { SetCard } from '../components/pokemon/set-card'
import { fetchExpansions } from '../lib/api'
import type { ExpansionSummary } from '../types'

const PAGE_SIZE = 12

export function SetsPage(): JSX.Element {
  const [page, setPage] = useState(1)

  const {
    data: expansions,
    isLoading,
    error
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  const sortedExpansions = useMemo(() => {
    if (!expansions) return []
    return [...expansions].sort((a, b) => {
      const releaseA = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
      const releaseB = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
      if (releaseA !== releaseB) return releaseA - releaseB
      return (a.name ?? a.set_code).localeCompare(b.name ?? b.set_code)
    })
  }, [expansions])

  const totalPages = Math.max(1, Math.ceil(sortedExpansions.length / PAGE_SIZE))

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages))
  }, [totalPages])

  const pagedExpansions = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return sortedExpansions.slice(startIndex, startIndex + PAGE_SIZE)
  }, [page, sortedExpansions])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokemon set index</p>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokemon Sets</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Browse every Pokemon TCG set in one place with simple pagination.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sets…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">Failed to load sets.</p>
      ) : sortedExpansions.length === 0 ? (
        <p className="text-sm text-slate-500">No sets found yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {sortedExpansions.length} {sortedExpansions.length === 1 ? 'set' : 'sets'} total
            </div>
            <span className="text-xs text-slate-400">•</span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pagedExpansions.map((expansion) => (
              <SetCard key={expansion.id} expansion={expansion} />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, sortedExpansions.length)} of{' '}
              {sortedExpansions.length}
            </div>
            <Button
              variant="secondary"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
