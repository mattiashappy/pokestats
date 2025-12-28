import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Layers, Loader2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import { fetchExpansions } from '../lib/api'
import type { ExpansionSummary } from '../types'

function SetCard({ expansion }: { expansion: ExpansionSummary }) {
  const releaseLabel = expansion.release_date
    ? `Released ${format(new Date(expansion.release_date), 'PP')}`
    : 'Release date pending'

  const cardsLabel = expansion.set_total ?? expansion.cards_total
  const auctionsLabel = expansion.linked_auctions ?? 0

  return (
    <Link to={`/pokemon/sets/${expansion.set_code}`} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden border-slate-200/80 shadow-none transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800/80">
        <div className="relative bg-gradient-to-br from-slate-100 to-white pb-[56.25%] dark:from-slate-900 dark:to-slate-950">
          {expansion.image_url ? (
            <img
              src={expansion.image_url}
              alt={expansion.name ?? expansion.set_code}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-3xl font-black tracking-tight text-slate-300 dark:text-slate-700">
              {expansion.set_code}
            </div>
          )}
          <Badge className="absolute left-3 top-3 bg-slate-900/80 text-xs uppercase text-white backdrop-blur-sm transition group-hover:bg-sky-600">
            {expansion.set_code}
          </Badge>
        </div>
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon set</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{expansion.name ?? 'Unknown set'}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{releaseLabel}</p>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Layers className="h-3.5 w-3.5" /> {cardsLabel ? `${cardsLabel} cards` : 'Cards pending'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">·</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {auctionsLabel.toLocaleString('sv-SE')} auctions linked
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
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

  const sorted = useMemo(() => {
    if (!expansions) return []
    return [...expansions].sort((a, b) => {
      const eraA = a.era || 'ZZZ'
      const eraB = b.era || 'ZZZ'
      if (eraA !== eraB) return eraA.localeCompare(eraB)

      const releaseA = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
      const releaseB = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
      if (releaseA !== releaseB) return releaseA - releaseB

      return a.set_code.localeCompare(b.set_code)
    })
  }, [expansions])

  const hasSets = (sorted?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokémon sets</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Browse every set in the database. Sets and cards are always available; auctions are shown as overlays when linked.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sets…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">Failed to load sets.</p>
      ) : !hasSets ? (
        <p className="text-sm text-slate-500">No sets found yet. Seed your first set to get started.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((expansion) => (
            <SetCard key={expansion.id} expansion={expansion} />
          ))}
        </div>
      )}
    </div>
  )
}
