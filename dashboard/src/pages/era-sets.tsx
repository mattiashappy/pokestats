import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Layers, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { SetCard } from '../components/pokemon/set-card'
import { useRegion } from '../contexts/region-context'
import { fetchEraExpansions, fetchEras } from '../lib/api'
import { formatEraYears, normalizeEraCode } from '../lib/era'
import { getExpansionIdentifier } from '../lib/sets'
import type { EraSummary, ExpansionSummary } from '../types'

export function EraSetsPage(): JSX.Element {
  const { eraCode = '' } = useParams()
  const normalizedEraCode = normalizeEraCode(eraCode) ?? eraCode
  const { language } = useRegion()

  const { data: eras } = useQuery<EraSummary[]>({
    queryKey: ['eras'],
    queryFn: fetchEras
  })

  const {
    data: expansions,
    isLoading,
    error
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['era-expansions', normalizedEraCode, language],
    queryFn: () => fetchEraExpansions(normalizedEraCode, language),
    enabled: Boolean(normalizedEraCode)
  })

  const eraInfo = useMemo(() => {
    if (!eras) return null
    return eras.find((era) => normalizeEraCode(era.code) === normalizedEraCode) ?? null
  }, [eras, normalizedEraCode])

  const sortedExpansions = useMemo(() => {
    if (!expansions) return []
    return [...expansions].sort((a, b) => {
      const releaseA = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
      const releaseB = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
      if (releaseA !== releaseB) return releaseA - releaseB
      return getExpansionIdentifier(a).localeCompare(getExpansionIdentifier(b))
    })
  }, [expansions])

  const eraName = eraInfo?.name ?? normalizedEraCode
  const eraYears = formatEraYears(eraInfo?.start_year ?? null, eraInfo?.end_year ?? null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/era">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to eras
          </Link>
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Era</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{eraName}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{eraYears}</p>
        </div>
        <Badge variant="secondary" className="ml-auto uppercase">
          {normalizedEraCode}
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sets…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">Failed to load sets for this era.</p>
      ) : sortedExpansions.length === 0 ? (
        <p className="text-sm text-slate-500">No sets found for this era yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Layers className="h-4 w-4" />
            {sortedExpansions.length} {sortedExpansions.length === 1 ? 'set' : 'sets'} in this era
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedExpansions.map((expansion) => (
              <SetCard key={expansion.id} expansion={expansion} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
