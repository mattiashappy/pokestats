import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Layers, ListFilter, Loader2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TransportBadge } from '../components/blocks/transport-badge'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchCards, fetchExpansions } from '../lib/api'
import type { CardListItem, ExpansionSummary } from '../types'

export function PokemonPage(): JSX.Element {
  const [selectedExpansion, setSelectedExpansion] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const {
    data: expansions,
    isLoading: isLoadingExpansions,
    error: expansionsError
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  useEffect(() => {
    if (expansions?.length && !selectedExpansion) {
      const first = expansions[0]
      setSelectedExpansion(first.id)
    }
  }, [expansions, selectedExpansion])

  const {
    data: cards,
    isLoading: isLoadingCards,
    error: cardsError
  } = useQuery<CardListItem[]>({
    queryKey: ['cards', selectedExpansion],
    queryFn: () => fetchCards(selectedExpansion ?? undefined),
    enabled: Number.isFinite(selectedExpansion)
  })

  const selectedExpansionMeta = useMemo(
    () => expansions?.find((exp) => exp.id === selectedExpansion) ?? null,
    [expansions, selectedExpansion]
  )

  const filteredCards = useMemo(() => {
    if (!cards) return []
    const term = searchTerm.trim().toLowerCase()

    if (!term) return cards

    return cards.filter((card) => {
      return (
        card.name.toLowerCase().includes(term) ||
        (card.card_number ?? '').toLowerCase().includes(term) ||
        (card.set_code ?? '').toLowerCase().includes(term)
      )
    })
  }, [cards, searchTerm])

  const totalExpansions = expansions?.length ?? 0
  const totalCardsInSet = selectedExpansionMeta?.cards_total ?? cards?.length ?? 0
  const totalLinkedAuctions = (cards ?? []).reduce((acc, card) => acc + (card.auction_count ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokémon cards</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Browse every card that has been normalized in the database. Pick an expansion first, then drill into the cards within it.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide text-slate-500">Expansions</CardDescription>
            <CardTitle className="text-3xl font-bold">{isLoadingExpansions ? '…' : totalExpansions}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 dark:text-slate-300">
            Distinct expansions discovered from the linked cards table.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide text-slate-500">Cards in selection</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoadingCards ? '…' : totalCardsInSet.toLocaleString('sv-SE')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 dark:text-slate-300">
            Counts reflect cards inside the chosen expansion.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide text-slate-500">Linked auctions</CardDescription>
            <CardTitle className="text-3xl font-bold">
              {isLoadingCards ? '…' : totalLinkedAuctions.toLocaleString('sv-SE')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 dark:text-slate-300">
            Auctions already mapped to cards in the selected expansion.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListFilter className="h-4 w-4 text-slate-400" />
              Filter by expansion
            </CardTitle>
            <CardDescription>Choose an expansion first, then search inside its cards.</CardDescription>
          </div>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-2 md:items-center md:gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expansion</p>
              {isLoadingExpansions ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading expansions…
                </div>
              ) : expansionsError ? (
                <p className="text-sm text-rose-400">Failed to load expansions.</p>
              ) : (
                <Select
                  value={selectedExpansion?.toString() ?? ''}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setSelectedExpansion(Number.isFinite(value) ? value : null)
                  }}
                  aria-label="Select expansion"
                >
                  {expansions?.map((expansion) => {
                    const value = expansion.id
                    const label = expansion.name
                      ? `${expansion.set_code} — ${expansion.name}`
                      : expansion.set_code
                    return (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  })}
                </Select>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search in expansion</p>
              <div className="relative">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by card name or number"
                  className="pr-10"
                />
                <Layers className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
        </CardHeader>

        {selectedExpansionMeta ? (
          <CardContent className="space-y-3 pt-0">
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-inner dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <TransportBadge stationCode={selectedExpansionMeta.set_code ?? '—'} highlight={selectedExpansionMeta.era ?? undefined} />
                  <div>
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{selectedExpansionMeta.name ?? 'Unknown set'}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {selectedExpansionMeta.cards_total.toLocaleString('sv-SE')} cards · {selectedExpansionMeta.linked_auctions.toLocaleString('sv-SE')} linked auctions
                    </p>
                  </div>
                </div>
                <div className="space-y-1 text-right text-xs text-slate-500">
                  {selectedExpansionMeta.set_total ? (
                    <div className="uppercase tracking-wide">Set total: {selectedExpansionMeta.set_total.toLocaleString('sv-SE')}</div>
                  ) : null}
                  {selectedExpansionMeta.release_date ? (
                    <div>Released {format(new Date(selectedExpansionMeta.release_date), 'PP')}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-slate-400" />
            Cards in expansion
          </CardTitle>
          <CardDescription>Cards are sourced directly from the cards table and linked to their auctions.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingCards ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading cards…
            </div>
          ) : cardsError ? (
            <p className="text-sm text-rose-400">Failed to load cards for this expansion.</p>
          ) : filteredCards.length === 0 ? (
            <p className="text-sm text-slate-500">No cards found in this expansion.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Linked auctions</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="text-right">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCards.map((card) => (
                    <TableRow key={card.id}>
                      <TableCell>
                        <Badge variant="secondary" className="uppercase">
                          {card.card_number ?? '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-y-1">
                        <Link
                          to={`/cards/${card.id}`}
                          className="font-semibold text-slate-900 hover:text-sky-600 dark:text-slate-50 dark:hover:text-sky-300"
                        >
                          {card.name}
                        </Link>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {card.set_code ? `${card.set_code} · ` : ''}
                          {card.set_name || 'Unknown set'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{card.auction_count.toLocaleString('sv-SE')}</TableCell>
                      <TableCell>
                        {card.last_sale_at ? (
                          <div className="space-y-0.5 text-sm">
                            <p className="text-slate-900 dark:text-slate-100">{format(new Date(card.last_sale_at), 'PP')}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Most recent linked auction</p>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`/cards/${card.id}`}>View card</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
