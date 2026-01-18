import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import DataTable from '../components/ui/data-table'
import { fetchCards, fetchExpansions } from '../lib/api'
import { normalizeEraCode } from '../lib/era'
import { getExpansionIdentifier } from '../lib/sets'
import type { CardListItem, ExpansionSummary } from '../types'

export function DashboardPage(): JSX.Element {
  const {
    data: expansions,
    isLoading: expansionsLoading,
    error: expansionsError
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  const {
    data: cards,
    isLoading: cardsLoading,
    error: cardsError
  } = useQuery<CardListItem[]>({
    queryKey: ['cards'],
    queryFn: fetchCards
  })

  const topSet = useMemo(() => {
    if (!expansions?.length) return null
    return [...expansions].sort((a, b) => (b.linked_auctions ?? 0) - (a.linked_auctions ?? 0))[0] ?? null
  }, [expansions])

  const topCard = useMemo(() => {
    if (!cards?.length) return null
    return [...cards].sort((a, b) => (b.linked_auctions ?? 0) - (a.linked_auctions ?? 0))[0] ?? null
  }, [cards])

  const latestCards = useMemo(() => {
    if (!cards?.length) return []
    return [...cards]
      .sort((a, b) => {
        const aTime = a.created_at ? Date.parse(a.created_at) : 0
        const bTime = b.created_at ? Date.parse(b.created_at) : 0
        return bTime - aTime
      })
      .slice(0, 5)
  }, [cards])

  const parseMarketPrice = (details?: string | null): string | null => {
    if (!details) return null
    const match = details.match(/Market price:\\s*\\$([\\d.]+)/i)
    if (!match) return null
    const value = Number(match[1])
    if (!Number.isFinite(value)) return null
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  }

  const topEra = useMemo(() => {
    if (!expansions?.length) return null

    const eraBuckets = new Map<string, { code: string | null; name: string; linkedAuctions: number }>()

    expansions.forEach((expansion) => {
      const name = expansion.era_name ?? expansion.era ?? 'Unknown era'
      const code = normalizeEraCode(expansion.era_code ?? expansion.era_name ?? expansion.era ?? name)
      const key = code ?? name
      const current = eraBuckets.get(key) ?? { code, name, linkedAuctions: 0 }

      current.linkedAuctions += expansion.linked_auctions ?? 0
      eraBuckets.set(key, current)
    })

    return [...eraBuckets.values()].sort((a, b) => b.linkedAuctions - a.linkedAuctions)[0] ?? null
  }, [expansions])

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Latest imported cards</CardTitle>
              <CardDescription>Showing the five most recent cards.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {cardsLoading ? (
              <p className="text-sm text-slate-500">Loading cards…</p>
            ) : cardsError ? (
              <p className="text-sm text-rose-400">Unable to load cards.</p>
            ) : latestCards.length === 0 ? (
              <p className="text-sm text-slate-500">No cards available yet.</p>
            ) : (
              <DataTable>
                <thead className="bg-amber-200">
                  <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                    <th className="px-3 py-2">Card</th>
                    <th className="px-3 py-2">Set</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2 text-right">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-900">
                  {latestCards.map((card) => (
                    <tr key={card.id} className="bg-white">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{card.name ?? 'Unknown card'}</p>
                        <p className="text-xs text-slate-500">
                          {card.card_number ? `#${card.card_number}` : 'Unnumbered'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{card.set_name ?? 'Unknown set'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-slate-900">
                          {parseMarketPrice(card.product_details) ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          to={`/cards/${card.id}`}
                          className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                        >
                          View card
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Popularity snapshots</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Most linked eras, sets, and cards</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ranked by how many linked auctions exist in the database.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Popularity leaderboard</CardTitle>
              <CardDescription>Live counts of the most active catalog entries.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {expansionsLoading || cardsLoading ? (
              <p className="text-sm text-slate-500">Loading popularity data…</p>
            ) : expansionsError || cardsError ? (
              <p className="text-sm text-rose-400">Unable to load popularity data.</p>
            ) : (
              <DataTable>
                <thead className="bg-amber-200">
                  <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-center">Linked auctions</th>
                    <th className="px-3 py-2 text-right">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-900">
                  <tr className="bg-white">
                    <td className="px-3 py-3 font-semibold text-slate-900">Era</td>
                    <td className="px-3 py-3">{topEra?.name ?? '—'}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-900">
                      {topEra?.linkedAuctions?.toLocaleString('sv-SE') ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {topEra?.code ? (
                        <Link
                          to={`/era/${topEra.code}`}
                          className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                        >
                          Explore era
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-3 font-semibold text-slate-900">Set</td>
                    <td className="px-3 py-3">{topSet ? topSet.name ?? getExpansionIdentifier(topSet) : '—'}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-900">
                      {(topSet?.linked_auctions ?? 0).toLocaleString('sv-SE')}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {topSet ? (
                        <Link
                          to={`/sets/${getExpansionIdentifier(topSet)}`}
                          className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                        >
                          View set
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-3 font-semibold text-slate-900">Card</td>
                    <td className="px-3 py-3">{topCard?.name ?? '—'}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-900">
                      {topCard?.linked_auctions?.toLocaleString('sv-SE') ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {topCard ? (
                        <Link
                          to={`/cards/${topCard.id}`}
                          className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                        >
                          View card
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </DataTable>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  )
}
