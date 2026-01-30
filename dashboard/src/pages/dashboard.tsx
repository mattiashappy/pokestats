import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import DataTable from '../components/ui/data-table'
import { useRegion } from '../contexts/region-context'
import { fetchCardDetails, fetchCards } from '../lib/api'
import { getCardSetIdentifier } from '../lib/sets'
import { getBestPrice, getBestPriceValue } from '../utils/priceHelper'
import type { CardListItem, CardResponse } from '../types'

export function DashboardPage(): JSX.Element {
  const featuredCardId = '68af87b6c4f780b5153e99c5'
  const { language } = useRegion()
  const { data: featuredCard } = useQuery<CardResponse>({
    queryKey: ['featured-card', featuredCardId],
    queryFn: () => fetchCardDetails(featuredCardId)
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [languageFilter, setLanguageFilter] = useState('english')
  const PAGE_SIZE = 10

  const formatCardNumber = (card: CardListItem): string | null => {
    if (!card.card_number) return null
    if (card.set_total && !card.card_number.includes('/')) {
      return `${card.card_number}/${card.set_total}`
    }
    return card.card_number
  }

  const {
    data: cards,
    isLoading: cardsLoading,
    error: cardsError
  } = useQuery<CardListItem[]>({
    queryKey: ['cards', searchTerm, languageFilter],
    queryFn: () => fetchCards({ search: searchTerm.trim() || undefined, language: languageFilter })
  })

  const filteredCards = useMemo(() => {
    if (!cards) return []
    const term = searchTerm.trim().toLowerCase()

    const matches = cards.filter((card) => {
      const cardSetIdentifier = getCardSetIdentifier(card) ?? ''
      const haystack = [
        card.name,
        card.set_name,
        card.set_code,
        card.card_number,
        card.era,
        cardSetIdentifier
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = !term || haystack.includes(term)
      return matchesSearch
    })

    return [...matches].sort((a, b) => {
      const aPrice = getBestPriceValue(a)
      const bPrice = getBestPriceValue(b)

      if (aPrice === null && bPrice === null) return 0
      if (aPrice === null) return 1
      if (bPrice === null) return -1
      if (aPrice === bPrice) {
        return (a.name ?? '').localeCompare(b.name ?? '')
      }
      return bPrice - aPrice
    })
  }, [cards, searchTerm])

  const totalPages = useMemo(() => {
    if (!filteredCards.length) return 1
    return Math.ceil(filteredCards.length / PAGE_SIZE)
  }, [filteredCards.length])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const pagedCards = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredCards.slice(start, start + PAGE_SIZE)
  }, [currentPage, filteredCards])

  const displayRange = useMemo(() => {
    if (!filteredCards.length) {
      return { start: 0, end: 0 }
    }
    const start = (currentPage - 1) * PAGE_SIZE + 1
    const end = Math.min(currentPage * PAGE_SIZE, filteredCards.length)
    return { start, end }
  }, [currentPage, filteredCards.length])

  const handleSearchChange = (value: string): void => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  return (
    <div className="space-y-16">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-8">
        <div className="relative">
          <div className="relative flex min-h-[400px] items-center justify-center">
            <div className="absolute left-8 top-4 z-10 border-2 border-slate-900 bg-emerald-200 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a]">
              ROI <span className="text-lg">302%</span>
            </div>
            {featuredCard?.image_url ? (
              <img
                src={featuredCard.image_url}
                alt={featuredCard.name ?? 'Featured card'}
                className="h-full max-h-[420px] w-full object-contain"
              />
            ) : (
              <div className="h-96 w-full max-w-sm animate-pulse rounded-lg bg-white/70" />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Pokestats Market Lab</p>
          <h2 className="text-3xl font-black text-slate-900 md:text-4xl">
            Pokémon Card Prices in Sweden, Real Sales Data from Tradera
          </h2>
          <p className="text-base text-slate-600">
            Every price is calculated from completed Tradera auctions and updated continuously. Track actual market
            behavior, measure ROI, and discover the next opportunity faster than the competition.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/sets"
              className="border-2 border-slate-900 bg-amber-200 px-5 py-3 text-sm font-bold uppercase tracking-wide shadow-[4px_4px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
            >
              Pokémon Sets
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-2xl font-black text-slate-900">Card catalog</h3>
            <p className="text-sm text-slate-600">Search and filter across every card in the database.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-2 text-sm shadow-[3px_3px_0px_#0f172a]">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                className="w-40 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Charizard, Umbreon..."
                type="text"
                value={searchTerm}
                onChange={(event) => handleSearchChange(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[3px_3px_0px_#0f172a]">
              <span>Language</span>
              <select
                className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                value={languageFilter}
                onChange={(event) => {
                  setLanguageFilter(event.target.value)
                  setCurrentPage(1)
                }}
              >
                <option value="all">All</option>
                <option value="english">English</option>
                <option value="japanese">Japanese</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>
            {displayRange.start}-{displayRange.end} of {filteredCards.length} cards
          </span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>

        {cardsLoading ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Loading card catalog…
          </div>
        ) : cardsError ? (
          <div className="rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50 px-6 py-12 text-center text-sm text-rose-600">
            Unable to load cards right now.
          </div>
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
              {pagedCards.length ? (
                pagedCards.map((card) => {
                  const setIdentifier = getCardSetIdentifier(card)
                  const detailHref = setIdentifier ? `/sets/${setIdentifier}/${card.id}` : `/cards/${card.id}`
                  const cardNumber = formatCardNumber(card)
                  return (
                    <tr key={card.id} className="bg-white">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{card.name ?? 'Unknown card'}</div>
                        <div className="text-xs text-slate-600">
                          {[card.set_name, card.era, cardNumber, setIdentifier]
                            .filter(Boolean)
                            .join(' · ') || 'Card details pending'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {[card.set_name, setIdentifier].filter(Boolean).join(' · ') || 'Set pending'}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-slate-900">
                        {getBestPrice(card)}
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
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    No cards match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="border-2 border-slate-900 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {displayRange.start}-{displayRange.end} of {filteredCards.length}
          </div>
          <button
            className="border-2 border-slate-900 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  )
}
