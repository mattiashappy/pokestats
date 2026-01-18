import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Layers, Search, Sparkles } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import DataTable from '../components/ui/data-table'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { fetchCards, fetchExpansions, searchCards } from '../lib/api'
import { normalizeEraCode } from '../lib/era'
import { getExpansionIdentifier } from '../lib/sets'
import type { CardListItem, CardSearchResult, ExpansionSummary } from '../types'

const SEARCH_DEBOUNCE_MS = 300

export function DashboardPage(): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [tableSearch, setTableSearch] = useState('')
  const [tableFilter, setTableFilter] = useState('all')

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSearchQuery(searchTerm.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(handler)
  }, [searchTerm])

  const {
    data: searchResults = [],
    isLoading: searchLoading,
    error: searchError
  } = useQuery<CardSearchResult[]>({
    queryKey: ['dashboard-card-search', searchQuery],
    queryFn: () => searchCards(searchQuery),
    enabled: searchQuery.length > 1
  })

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

  const filteredCards = useMemo(() => {
    if (!cards) return []
    const term = tableSearch.trim().toLowerCase()
    if (!term) return cards

    return cards.filter((card) => {
      const matches = (value?: string | null) => value?.toLowerCase().includes(term)
      if (tableFilter === 'name') return matches(card.name)
      if (tableFilter === 'set') return matches(card.set_name) || matches(card.set_code)
      if (tableFilter === 'number') return matches(card.card_number)
      if (tableFilter === 'era') return matches(card.era)
      return (
        matches(card.name) ||
        matches(card.set_name) ||
        matches(card.set_code) ||
        matches(card.card_number) ||
        matches(card.era)
      )
    })
  }, [cards, tableFilter, tableSearch])

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
      <section className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:bg-slate-900/70 dark:text-sky-200">
              <Sparkles className="h-4 w-4" />
              PokéStats Dashboard
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 sm:text-4xl">
              Search every auction-linked card in seconds.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 dark:text-slate-300">
              Start with a card name, set code, or collector number. The results will surface the most active cards in the Tradera
              feed.
            </p>
          </div>

          <div className="w-full max-w-xl rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setSearchQuery(searchTerm.trim())
              }}
            >
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" htmlFor="dashboard-search">
                Search cards
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="dashboard-search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by card name, set, or number"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" className="gap-2">
                  Search
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              {searchQuery.length <= 1 ? (
                <p className="text-slate-500 dark:text-slate-400">Try “Charizard”, “SV2a”, or “001/102”.</p>
              ) : searchLoading ? (
                <p className="text-slate-500 dark:text-slate-400">Searching cards…</p>
              ) : searchError ? (
                <p className="text-rose-400">Unable to load search results.</p>
              ) : searchResults.length ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Top matches
                  </p>
                  <div className="space-y-2">
                    {searchResults.slice(0, 5).map((result) => {
                      const label = result.name ?? 'Unknown card'
                      const meta = [result.setName, result.cardNumber].filter(Boolean).join(' · ')
                      return (
                        <Link
                          key={result.id}
                          to={`/cards/${result.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-300 hover:text-slate-900 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-200"
                          onClick={() => {
                            setSearchTerm('')
                            setSearchQuery('')
                          }}
                        >
                          <span className="font-medium">{label}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{meta || 'No set details'}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No cards matched that search.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card explorer</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">All tracked cards</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Filter the full catalog by card attributes and jump straight to a card page.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Card catalog</CardTitle>
              <CardDescription>Search and filter across every card in the database.</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <div className="relative w-full md:w-72">
                <Input
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder="Search cards"
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <Select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} className="md:w-52">
                <option value="all">All columns</option>
                <option value="name">Card name</option>
                <option value="set">Set</option>
                <option value="number">Card number</option>
                <option value="era">Era</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {cardsLoading ? (
              <p className="text-sm text-slate-500">Loading cards…</p>
            ) : cardsError ? (
              <p className="text-sm text-rose-400">Unable to load cards.</p>
            ) : filteredCards.length === 0 ? (
              <p className="text-sm text-slate-500">No cards match that filter.</p>
            ) : (
              <DataTable>
                <thead className="bg-amber-200">
                  <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                    <th className="px-3 py-2">Card</th>
                    <th className="px-3 py-2">Set</th>
                    <th className="px-3 py-2">Era</th>
                    <th className="px-3 py-2 text-center">Linked auctions</th>
                    <th className="px-3 py-2">Last seen</th>
                    <th className="px-3 py-2 text-right">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-900">
                  {filteredCards.map((card) => (
                    <tr key={card.id} className="bg-white">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{card.name ?? 'Unknown card'}</p>
                        <p className="text-xs text-slate-500">
                          {card.card_number ? `#${card.card_number}` : 'Unnumbered'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{card.set_name ?? 'Unknown set'}</p>
                        <p className="text-xs text-slate-500">{card.set_code ?? 'Set code pending'}</p>
                      </td>
                      <td className="px-3 py-3">{card.era ?? 'Unknown era'}</td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-900">
                        {card.linked_auctions.toLocaleString('sv-SE')}
                      </td>
                      <td className="px-3 py-3">
                        {card.last_seen ? (
                          <div className="space-y-0.5 text-sm">
                            <p className="text-slate-900">{format(new Date(card.last_seen), 'PP')}</p>
                            <p className="text-xs text-slate-600">Most recent linked auction</p>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
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
