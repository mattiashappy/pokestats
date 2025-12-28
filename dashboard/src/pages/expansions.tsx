import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Layers, Loader2 } from 'lucide-react'

import { TransportBadge } from '@/components/blocks/transport-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchExpansions } from '@/lib/api'
import type { ExpansionSummary } from '@/types'

export function ExpansionsPage(): JSX.Element {
  const {
    data: expansions,
    isLoading,
    error
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  const groupedByEra = useMemo(() => {
    const groups: Record<string, ExpansionSummary[]> = {}
    const sorted = [...(expansions ?? [])].sort((a, b) => {
      const eraA = a.era || 'Unknown era'
      const eraB = b.era || 'Unknown era'
      if (eraA !== eraB) return eraA.localeCompare(eraB)

      const dateA = a.release_date ? new Date(a.release_date).getTime() : Number.MAX_SAFE_INTEGER
      const dateB = b.release_date ? new Date(b.release_date).getTime() : Number.MAX_SAFE_INTEGER
      if (dateA !== dateB) return dateA - dateB

      return a.set_code.localeCompare(b.set_code)
    })

    for (const expansion of sorted) {
      const era = expansion.era || 'Unknown era'
      if (!groups[era]) {
        groups[era] = []
      }
      groups[era].push(expansion)
    }

    return groups
  }, [expansions])

  const hasExpansions = (expansions?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="h-5 w-5 text-sky-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expansions</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Expansion library</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Live view of every expansion stored in the database. Cards and auctions will appear as soon as you seed the first
            sets.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Set codes</p>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Use expansion codes as the primary key</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Each badge mirrors the set code stored in the database so you can scan, filter, and click through to the matching
              cards.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading expansions…
          </div>
        ) : error ? (
          <p className="text-sm text-rose-400">Failed to load expansions.</p>
        ) : !hasExpansions ? (
          <p className="text-sm text-slate-500">No expansions found yet. Seed your first set to see it here.</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedByEra).map(([era, eraExpansions]) => (
              <div key={era} className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Era</p>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{era}</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {eraExpansions.map((expansion) => (
                    <Card
                      key={`${era}-${expansion.set_code}`}
                      className="border-slate-200/80 shadow-none ring-1 ring-slate-200/70 dark:border-slate-800/80 dark:ring-slate-800/80"
                    >
                      <CardHeader className="space-y-3 pb-3">
                        <TransportBadge
                          system="PKMN"
                          stationCode={expansion.set_code}
                          highlight={expansion.era ?? undefined}
                          className="w-fit"
                        />
                        <div>
                          <CardTitle className="text-xl text-slate-900 dark:text-slate-50">{expansion.name ?? 'Unknown set'}</CardTitle>
                          <CardDescription>
                            {expansion.release_date ? `Released ${format(new Date(expansion.release_date), 'PP')}` : 'Release date pending'}
                          </CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                        <div className="flex flex-col">
                          <span className="text-xs uppercase tracking-wide text-slate-500">Cards</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{expansion.cards_total}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-xs uppercase tracking-wide text-slate-500">Linked auctions</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{expansion.linked_auctions}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
