import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Loader2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { fetchEras } from '../lib/api'
import { formatEraYears, normalizeEraCode } from '../lib/era'
import type { EraSummary } from '../types'

export function ErasPage(): JSX.Element {
  const {
    data: eras,
    isLoading,
    error
  } = useQuery<EraSummary[]>({
    queryKey: ['eras'],
    queryFn: fetchEras
  })

  const orderedEras = useMemo(() => {
    if (!eras) return []
    return [...eras].sort((a, b) => {
      const orderDiff = (a.sort_order ?? 999) - (b.sort_order ?? 999)
      if (orderDiff !== 0) return orderDiff
      return a.name.localeCompare(b.name)
    })
  }, [eras])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokémon eras</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Navigate by era to find the sets and cards you care about.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading eras…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">Failed to load eras.</p>
      ) : orderedEras.length === 0 ? (
        <p className="text-sm text-slate-500">No eras found yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderedEras.map((era) => {
            const eraCode = normalizeEraCode(era.code) ?? era.code
            const eraYears = formatEraYears(era.start_year, era.end_year)
            return (
              <Link key={era.code} to={`/era/${eraCode}`} className="group block h-full">
                <Card className="h-full border-slate-200/80 shadow-none transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800/80">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-slate-400" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{era.name}</h2>
                      </div>
                      <Badge variant="secondary" className="uppercase">
                        {eraCode}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{eraYears}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {era.sets_total} {era.sets_total === 1 ? 'set' : 'sets'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
