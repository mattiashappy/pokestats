import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Calendar, Layers, Loader2, Search } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchCardsForSet, fetchExpansions } from '../lib/api'
import { normalizeEraCode } from '../lib/era'
import type { CardListItem, ExpansionSummary } from '../types'

export function PokemonSetPage(): JSX.Element {
  const { setCode = '', eraCode } = useParams()
  const [searchTerm, setSearchTerm] = useState('')

  const {
    data: expansions,
    isLoading: isLoadingExpansions,
    error: expansionsError
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  const {
    data: cards,
    isLoading: isLoadingCards,
    error: cardsError
  } = useQuery<CardListItem[]>({
    queryKey: ['cards', setCode],
    queryFn: () => fetchCardsForSet(setCode),
    enabled: Boolean(setCode)
  })

  const expansion = useMemo(() => {
    if (!expansions) return null
    const normalized = setCode.toLowerCase()
    return expansions.find((expansion) => expansion.set_code.toLowerCase() === normalized) ?? null
  }, [expansions, setCode])

  const resolvedEraCode = normalizeEraCode(eraCode ?? expansion?.era_code ?? null)

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

  const headerLabel = expansion?.name ?? setCode
  const setTotal = expansion?.set_total ?? expansion?.cards_total ?? cards?.length ?? null
  const backLink = resolvedEraCode ? `/era/${resolvedEraCode}` : '/era'
  const backLabel = resolvedEraCode ? `Back to ${expansion?.era_name ?? expansion?.era ?? resolvedEraCode}` : 'Back to eras'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={backLink}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
            </Link>
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon set</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{headerLabel}</h1>
            {expansionsError ? (
              <CardDescription className="text-sm text-rose-400">Failed to load set metadata.</CardDescription>
            ) : expansion ? (
              <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
                {expansion.set_code} · {expansion.era_name ?? expansion.era ?? 'Unknown era'} · {expansion.language || 'Unknown language'}
              </CardDescription>
            ) : isLoadingExpansions ? (
              <CardDescription className="text-sm text-slate-500">Loading set metadata…</CardDescription>
            ) : null}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-slate-400" />
              {headerLabel}
            </CardTitle>
            <CardDescription>All cards in this set. Auctions appear when they have been linked.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
              {expansion?.release_date ? (
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <Calendar className="h-3.5 w-3.5" /> Released {format(new Date(expansion.release_date), 'PP')}
                </span>
              ) : null}
              {setTotal ? <span className="text-slate-600 dark:text-slate-300">{setTotal} cards</span> : null}
              <Badge variant="secondary" className="uppercase">
                {setCode}
              </Badge>
            </div>
            <div className="relative w-full md:w-72">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search within this set"
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingCards ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading cards…
            </div>
          ) : cardsError ? (
            <p className="text-sm text-rose-400">Failed to load cards for this set.</p>
          ) : filteredCards.length === 0 ? (
            <p className="text-sm text-slate-500">No cards found in this set.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Number</TableHead>
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
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{card.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {card.card_number ? `${card.card_number}` : 'Unnumbered'}
                          {card.set_total ? ` / ${card.set_total}` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">{card.linked_auctions.toLocaleString('sv-SE')}</TableCell>
                      <TableCell>
                        {card.last_seen ? (
                          <div className="space-y-0.5 text-sm">
                            <p className="text-slate-900 dark:text-slate-100">{format(new Date(card.last_seen), 'PP')}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Most recent linked auction</p>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="secondary">
                            <Link
                              to={
                                resolvedEraCode
                                ? `/era/${resolvedEraCode}/${setCode}/${card.id}`
                                : `/cards/${card.id}`
                              }
                            >
                            View card
                          </Link>
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
