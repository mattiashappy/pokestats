import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Layers, Search, Sparkles } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import DataTable from '../components/ui/data-table'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { fetchCards, fetchEras, fetchExpansions, searchCards } from '../lib/api'
import { formatEraYears, normalizeEraCode } from '../lib/era'
import { getExpansionIdentifier } from '../lib/sets'
import type { CardListItem, CardSearchResult, EraSummary, ExpansionSummary } from '../types'

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

  const {
    data: eras,
    isLoading: erasLoading,
    error: erasError
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

  const topSet = useMemo(() => {
    if (!expansions?.length) return null
    return [...expansions].sort((a, b) => (b.linked_auctions ?? 0) - (a.linked_auctions ?? 0))[0] ?? null
  }, [expansions])

  const latestSets = useMemo(() => {
    if (!expansions?.length) return []
    return [...expansions]
      .sort((a, b) => {
        const dateA = a.release_date ? new Date(a.release_date).getTime() : 0
        const dateB = b.release_date ? new Date(b.release_date).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 5)
  }, [expansions])

  const topCard = useMemo(() => {
    if (!cards?.length) return null
    return [...cards].sort((a, b) => (b.linked_auctions ?? 0) - (a.linked_auctions ?? 0))[0] ?? null
  }, [cards])

  const latestCards = useMemo(() => {
    if (!cards?.length) return []
    return [...cards]
      .sort((a, b) => {
        const dateA = a.last_seen ?? a.created_at ?? ''
        const dateB = b.last_seen ?? b.created_at ?? ''
        return dateB.localeCompare(dateA)
      })
      .slice(0, 5)
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

  const eraPreviews = useMemo(() => {
    if (!expansions?.length) return new Map<string, { imageUrl: string | null; releaseDate: number }>()

    const previews = new Map<string, { imageUrl: string | null; releaseDate: number }>()

    expansions.forEach((expansion) => {
      const name = expansion.era_name ?? expansion.era ?? 'Unknown era'
      const code = normalizeEraCode(expansion.era_code ?? expansion.era_name ?? expansion.era ?? name)
      const key = code ?? name
      if (!key) return

      const imageUrl =
        expansion.image_cdn_url800 ?? expansion.image_cdn_url400 ?? expansion.image_cdn_url200 ?? expansion.image_url ?? null
      const releaseDate = expansion.release_date ? new Date(expansion.release_date).getTime() : 0
      const current = previews.get(key)

      if (!current || releaseDate > current.releaseDate) {
        previews.set(key, { imageUrl, releaseDate })
      }
    })

    return previews
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Popularity snapshots</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Most linked eras, sets, and cards</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Ranked by how many linked auctions exist in the database.</p>
          </div>
          <Badge variant="secondary">Live auction links</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="space-y-1">
              <CardDescription>Most popular era</CardDescription>
              <CardTitle className="text-2xl">{topEra?.name ?? '—'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {expansionsLoading ? (
                <p>Calculating linked auctions…</p>
              ) : expansionsError ? (
                <p className="text-rose-400">Unable to load era popularity.</p>
              ) : topEra && topEra.linkedAuctions > 0 ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Linked auctions</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {topEra.linkedAuctions.toLocaleString('sv-SE')}
                  </p>
                  {topEra.code ? (
                    <Link to={`/era/${topEra.code}`} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
                      Explore era
                    </Link>
                  ) : null}
                </>
              ) : (
                <p>No linked auctions yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardDescription>Most popular set</CardDescription>
              <CardTitle className="text-2xl">
                {topSet ? topSet.name ?? getExpansionIdentifier(topSet) : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {expansionsLoading ? (
                <p>Finding top set…</p>
              ) : expansionsError ? (
                <p className="text-rose-400">Unable to load set popularity.</p>
              ) : topSet && (topSet.linked_auctions ?? 0) > 0 ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Linked auctions</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {(topSet.linked_auctions ?? 0).toLocaleString('sv-SE')}
                  </p>
                  {topSet ? (
                    <Link
                      to={`/sets/${getExpansionIdentifier(topSet)}`}
                      className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                    >
                      View set cards
                    </Link>
                  ) : null}
                </>
              ) : (
                <p>No linked auctions yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardDescription>Most popular card</CardDescription>
              <CardTitle className="text-2xl">{topCard?.name ?? '—'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {cardsLoading ? (
                <p>Finding top card…</p>
              ) : cardsError ? (
                <p className="text-rose-400">Unable to load card popularity.</p>
              ) : topCard && topCard.linked_auctions > 0 ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Linked auctions</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {topCard.linked_auctions.toLocaleString('sv-SE')}
                  </p>
                  <Link to={`/cards/${topCard.id}`} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
                    Open card page
                  </Link>
                </>
              ) : (
                <p>No linked auctions yet.</p>
              )}
            </CardContent>
          </Card>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Catalog refresh</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Newest sets and cards</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Recently added expansions and card pages from the live catalog feed.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Latest sets</CardTitle>
              <CardDescription>Fresh expansions ready to explore.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {expansionsLoading ? (
                <p>Loading newest sets…</p>
              ) : expansionsError ? (
                <p className="text-rose-400">Unable to load newest sets.</p>
              ) : latestSets.length ? (
                <ul className="space-y-2">
                  {latestSets.map((set) => (
                    <li key={set.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {set.name ?? getExpansionIdentifier(set)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {set.release_date ? new Date(set.release_date).toLocaleDateString('sv-SE') : 'Release date pending'}
                        </p>
                      </div>
                      <Link to={`/sets/${getExpansionIdentifier(set)}`} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                        View cards
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No new sets yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Latest cards</CardTitle>
              <CardDescription>Recently indexed card pages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {cardsLoading ? (
                <p>Loading newest cards…</p>
              ) : cardsError ? (
                <p className="text-rose-400">Unable to load newest cards.</p>
              ) : latestCards.length ? (
                <ul className="space-y-2">
                  {latestCards.map((card) => (
                    <li key={card.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">{card.name ?? 'Unknown card'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {[card.set_name ?? card.set_code, card.card_number].filter(Boolean).join(' · ') || 'Set details pending'}
                        </p>
                      </div>
                      <Link to={`/cards/${card.id}`} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
                        Open card
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No new cards yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-amber-500" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Browse by era</p>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Pokémon eras</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Jump into sets and cards using the era tiles below.</p>
          </div>
        </div>

        {erasLoading ? (
          <p className="text-sm text-slate-500">Loading eras…</p>
        ) : erasError ? (
          <p className="text-sm text-rose-400">Failed to load eras.</p>
        ) : orderedEras.length === 0 ? (
          <p className="text-sm text-slate-500">No eras found yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orderedEras.map((era) => {
              const eraCode = normalizeEraCode(era.code) ?? era.code
              const eraYears = formatEraYears(era.start_year, era.end_year)
              const preview = eraPreviews.get(eraCode ?? era.name)
              const previewImage = preview?.imageUrl ?? null
              return (
                <Link key={era.code} to={`/era/${eraCode}`} className="group block h-full">
                  <Card className="flex h-full flex-col overflow-hidden border-slate-200/80 shadow-none transition hover:-translate-y-1 hover:shadow-md dark:border-slate-800/80">
                    <div className="relative bg-gradient-to-br from-slate-100 to-white pb-[56.25%] dark:from-slate-900 dark:to-slate-950">
                      {previewImage ? (
                        <img src={previewImage} alt={era.name} className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-3xl font-black tracking-tight text-slate-300 dark:text-slate-700">
                          {eraCode}
                        </div>
                      )}

                      <Badge className="absolute left-3 top-3 bg-slate-900/80 text-xs uppercase text-white backdrop-blur-sm transition group-hover:bg-sky-600">
                        {eraCode}
                      </Badge>
                    </div>

                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-slate-400" />
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{era.name}</h3>
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
      </section>
    </div>
  )
}
