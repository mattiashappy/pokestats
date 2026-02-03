import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Calendar, Layers, Loader2, Search } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import DataTable from '../components/ui/data-table'
import { Input } from '../components/ui/input'
import { useRegion } from '../contexts/region-context'
import { fetchCardsForSet, fetchExpansions } from '../lib/api'
import { getCardSetIdentifier, getExpansionIdentifier } from '../lib/sets'
import { getTcgMarketPrice, getTraderaMarketPrice } from '../utils/priceHelper'
import type { CardListItem, ExpansionSummary } from '../types'

export function PokemonSetPage(): JSX.Element {
  const { setCode = '' } = useParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const languageFilter = searchParams.get('language') || 'all'
  const languageOptions = [
    { label: 'All', value: 'all' },
    { label: 'English', value: 'english' },
    { label: 'Japanese', value: 'japanese' }
  ]

  const formatCardNumber = (card: CardListItem): string | null => {
    if (!card.card_number) return null
    if (card.set_total && !card.card_number.includes('/')) {
      return `${card.card_number}/${card.set_total}`
    }
    return card.card_number
  }

  const {
    data: expansions,
    isLoading: isLoadingExpansions,
    error: expansionsError
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions', languageFilter],
    queryFn: () => fetchExpansions(languageFilter)
  })

  const {
    data: cards,
    isLoading: isLoadingCards,
    error: cardsError
  } = useQuery<CardListItem[]>({
    queryKey: ['cards', setCode, languageFilter],
    queryFn: () => fetchCardsForSet(setCode, languageFilter),
    enabled: Boolean(setCode)
  })

  const expansion = useMemo(() => {
    if (!expansions) return null
    const normalized = setCode.toLowerCase()
    return (
      expansions.find((expansion) => getExpansionIdentifier(expansion).toLowerCase() === normalized) ?? null
    )
  }, [expansions, setCode])

  const filteredCards = useMemo(() => {
    if (!cards) return []
    const term = searchTerm.trim().toLowerCase()
    if (!term) return cards
    return cards.filter((card) => {
      const cardSetIdentifier = getCardSetIdentifier(card) ?? ''
      return (
        card.name.toLowerCase().includes(term) ||
        (card.card_number ?? '').toLowerCase().includes(term) ||
        cardSetIdentifier.toLowerCase().includes(term)
      )
    })
  }, [cards, searchTerm])

  const headerLabel = expansion?.name ?? setCode
  const headerCode = expansion ? getExpansionIdentifier(expansion) : setCode
  const setTotal = expansion?.set_total ?? expansion?.cards_total ?? cards?.length ?? null
  const backLink = '/sets'
  const backLabel = 'Back to sets'

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
                {headerCode} · {expansion.era_name ?? expansion.era ?? 'Unknown era'} · {expansion.language || 'Unknown language'}
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
                {headerCode}
              </Badge>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto">
              <div className="relative w-full md:w-72">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search within this set"
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <label className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[3px_3px_0px_#0f172a]">
                <span>Language</span>
                <select
                  className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                  value={languageFilter}
                  onChange={(event) => {
                    const next = event.target.value
                    const nextParams = new URLSearchParams(searchParams)
                    if (next === 'all') {
                      nextParams.delete('language')
                    } else {
                      nextParams.set('language', next)
                    }
                    setSearchParams(nextParams)
                  }}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
            <DataTable>
              <thead className="bg-amber-200">
                <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                  <th className="px-4 py-3">Card</th>
                  <th className="px-4 py-3">Set</th>
                  <th className="px-4 py-3 text-right">Market price</th>
                  <th className="px-4 py-3 text-right">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-900">
                {filteredCards.map((card) => {
                  const setIdentifier = getCardSetIdentifier(card)
                  const detailHref = setIdentifier ? `/sets/${setIdentifier}/${card.id}` : `/cards/${card.id}`
                  const cardNumber = formatCardNumber(card)
                  return (
                    <tr key={card.id} className="bg-white">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{card.name ?? 'Unknown card'}</div>
                        <div className="text-xs text-slate-600">
                          {[card.set_name, cardNumber].filter(Boolean).join(' · ') || 'Card details pending'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {[card.set_name].filter(Boolean).join(' · ') || 'Set pending'}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">
                        <div>{getTcgMarketPrice(card)}</div>
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Tradera price: <span className="text-slate-900">{getTraderaMarketPrice(card)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          to={detailHref}
                          className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                        >
                          View card
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
