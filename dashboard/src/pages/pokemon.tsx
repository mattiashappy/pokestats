// src/pages/PokemonPage.tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Loader2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { SetCard } from '../components/pokemon/set-card'
import { fetchEras, fetchExpansions } from '../lib/api'
import { formatEraYears, normalizeEraCode } from '../lib/era'
import type { EraSummary, ExpansionSummary } from '../types'

type EraGroup = {
  era: EraSummary
  expansions: ExpansionSummary[]
}

export function PokemonPage(): JSX.Element {
  const {
    data: expansions,
    isLoading,
    error
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  const { data: eras } = useQuery<EraSummary[]>({
    queryKey: ['eras'],
    queryFn: fetchEras
  })

  const groupedEras = useMemo<EraGroup[]>(() => {
    if (!expansions?.length) return []

    const eraMap = new Map<string, EraSummary>()
    eras?.forEach((era) => {
      eraMap.set(normalizeEraCode(era.code) ?? era.code, era)
    })

    const groups = new Map<string, EraGroup>()

    expansions.forEach((expansion) => {
      const eraCode = normalizeEraCode(expansion.era_code ?? expansion.era ?? '') ?? 'OTHER'
      const eraInfo =
        eraMap.get(eraCode) ??
        ({
          id: null,
          code: eraCode,
          name: expansion.era ?? 'Unknown era',
          sort_order: 999,
          start_year: null,
          end_year: null,
          sets_total: 0
        } satisfies EraSummary)

      const existing = groups.get(eraCode)
      if (existing) {
        existing.expansions.push(expansion)
        return
      }

      groups.set(eraCode, { era: eraInfo, expansions: [expansion] })
    })

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        expansions: [...group.expansions].sort((a, b) => {
          const releaseA = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
          const releaseB = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
          if (releaseA !== releaseB) return releaseA - releaseB
          return a.set_code.localeCompare(b.set_code)
        })
      }))
      .sort((a, b) => {
        const orderDiff = (a.era.sort_order ?? 999) - (b.era.sort_order ?? 999)
        if (orderDiff !== 0) return orderDiff
        return a.era.name.localeCompare(b.era.name)
      })
  }, [eras, expansions])

  const hasSets = groupedEras.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sets</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Sets</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Browse every set in the database. Sets and cards are always available; auctions are shown as overlays when linked.
          </p>
        </div>
        <div className="ml-auto">
          <Button asChild variant="secondary" size="sm">
            <Link to="/era">Browse eras</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sets…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">Failed to load sets.</p>
      ) : !hasSets ? (
        <p className="text-sm text-slate-500">
          No sets found yet. Seed your first set to get started.
        </p>
      ) : (
        <div className="space-y-8">
          {groupedEras.map((group) => {
            const eraYears = formatEraYears(group.era.start_year, group.era.end_year)
            return (
              <section key={group.era.code} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-500" />
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{group.era.name}</h2>
                      <p className="text-xs text-slate-500">{eraYears}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs font-semibold uppercase tracking-wide">
                    {group.expansions.length} {group.expansions.length === 1 ? 'set' : 'sets'}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.expansions.map((expansion) => (
                    <SetCard key={expansion.id} expansion={expansion} eraCode={group.era.code} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
