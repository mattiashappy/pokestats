import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react' // Added Loader/Alert icons
import { Link, useParams } from 'react-router-dom'

import { Button } from '../components/ui/button'
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { fetchCardAuctions, fetchCardDetails } from '../lib/api'
import { useAuth } from '../providers/auth'
import { getCardSetIdentifier } from '../lib/sets'
import { getMarketPrice } from '../utils/priceHelper'
import type { AuctionRecord } from '../types'

function formatUsd(value: string): string {
  return value === 'N/A' ? '—' : value
}

function formatSek(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(Number(value))
}

export function CardPage(): JSX.Element {
  const { id, setCode } = useParams()
  const { user } = useAuth()

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError
  } = useQuery({
    queryKey: ['card', id],
    queryFn: () => fetchCardDetails(id ?? '', { includeHistory: true }),
    enabled: Boolean(id)
  })

  const { data: auctions } = useQuery<AuctionRecord[]>({
    queryKey: ['card-auctions', id],
    queryFn: () => fetchCardAuctions(id ?? ''),
    enabled: Boolean(id)
  })

  // --- MEMOS ---

  const headerLabel = useMemo(() => {
    if (!card) return '...'
    if (card.card_number) return `${card.name} - ${card.card_number}`
    return card.name
  }, [card])

  const productDetails = useMemo(() => {
    if (!card?.product_details) return []
    return card.product_details
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && !line.toLowerCase().startsWith('last updated:'))
  }, [card?.product_details])

  const typeBadges = useMemo(() => {
    const types = new Set<string>()
    if (card?.pokemon_type) types.add(card.pokemon_type)
    card?.energy_type?.forEach((type) => {
      if (type) types.add(type)
    })
    return Array.from(types)
  }, [card?.pokemon_type, card?.energy_type])

  const statsLabel = useMemo(() => {
    if (!card) return null
    const parts = []
    if (card.stage) parts.push(card.stage)
    if (Number.isFinite(Number(card.hp))) parts.push(`${card.hp} HP`)
    return parts.length ? parts.join(' - ') : null
  }, [card])

  const traderaStats = useMemo(() => {
    const prices = (auctions ?? [])
      .map((auction) => auction.price)
      .filter((price): price is number => Number.isFinite(Number(price)))
      .map((price) => Number(price))
    
    if (!prices.length) return { average: null }
    
    const total = prices.reduce((acc, price) => acc + price, 0)
    return {
      average: total / prices.length
    }
  }, [auctions])

  const traderaTotalsByCondition = useMemo(() => {
    const buckets = {
      'Mycket gott skick': 0,
      'Gott skick': 0,
      'Okej skick': 0,
      Oanvänt: 0
    }

    for (const auction of auctions ?? []) {
      if (!Number.isFinite(Number(auction.price))) continue
      const price = Number(auction.price)
      const normalized = (auction.itemCondition ?? '').trim().toLowerCase()

      if (normalized === 'mycket gott skick') buckets['Mycket gott skick'] += price
      else if (normalized === 'gott skick') buckets['Gott skick'] += price
      else if (normalized === 'okej skick') buckets['Okej skick'] += price
      else if (normalized === 'oanvänt') buckets.Oanvänt += price
    }

    return buckets
  }, [auctions])

  const traderaTotal = useMemo(() => {
    return (auctions ?? []).reduce((acc, auction) => {
      if (!Number.isFinite(Number(auction.price))) return acc
      return acc + Number(auction.price)
    }, 0)
  }, [auctions])

  const isAdmin = user?.role === 'admin'

  // --- RESOLVE NAVIGATION ---
  const resolvedSetCode = setCode ?? (card ? getCardSetIdentifier(card) : null)
  const resolvedSetName = card?.set_name || resolvedSetCode
  const backLink = resolvedSetCode ? `/sets/${resolvedSetCode}` : '/sets'
  const backLabel = resolvedSetName ? `Back to ${resolvedSetName}` : 'Back to sets'

  // --- EARLY RETURNS FOR STATES ---

  if (isLoadingCard) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
      </div>
    )
  }

  if (cardError || !card) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <h2 className="text-xl font-bold text-slate-900">Failed to load card</h2>
        <Button asChild variant="outline">
           <Link to="/sets">Go back to Sets</Link>
        </Button>
      </div>
    )
  }

  // --- RENDER ---

  return (
    <div className="space-y-8">
      {/* HEADER SECTION */}
      <section className="rounded-3xl border-4 border-slate-900 bg-amber-200 p-6 shadow-[6px_6px_0px_#0f172a]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Button
            asChild
            size="sm"
            className="h-9 border-2 border-slate-900 bg-white px-4 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
          >
            <Link to={backLink}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
            </Link>
          </Button>
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-[2px_2px_0px_#0f172a]">
            Card details
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <h1 className="text-4xl font-black uppercase text-slate-900">{headerLabel}</h1>
          {statsLabel ? (
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">{statsLabel}</p>
          ) : null}
          
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-900">
            <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
              Name: {card.name || 'Unknown name'}
            </span>
            <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
              Era: {card.era || 'Unknown era'}
            </span>
            <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
              Set: {card.set_name || 'Unknown set'}
            </span>
            <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
              Language: {card.language || 'Unknown language'}
            </span>
            <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
              Card number: {card.card_number || 'N/A'}
            </span>
            {typeBadges.length ? (
              <span className="inline-flex flex-wrap gap-2">
                {typeBadges.map((type) => (
                  <span
                    key={type}
                    className="rounded-full border-2 border-slate-900 bg-amber-50 px-3 py-1 shadow-[2px_2px_0px_#0f172a]"
                  >
                    Type: {type}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* LEFT COLUMN: IMAGE */}
        <div>
          {card.image_url ? (
            <img src={card.image_url} alt={card.name} className="h-auto w-full" />
          ) : (
            <div className="flex h-64 items-center justify-center bg-amber-50 text-sm font-semibold uppercase tracking-wide text-slate-600">
              No image available
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DETAILS */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr),240px]">
          <div className="space-y-6">
            <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
              <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
                <CardTitle className="text-lg font-black uppercase text-white">Market price</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                  Latest market pricing for this card.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 text-sm font-semibold uppercase text-slate-900">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Market price</div>
                  <div className="text-2xl font-black">{formatUsd(getMarketPrice(card))}</div>
                </div>
              </CardContent>
            </UiCard>

            <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
              <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
                <CardTitle className="text-lg font-black uppercase text-white">Tradera</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                  {isAdmin
                    ? 'Price sums grouped by listed card condition.'
                    : 'Combined Tradera sum for linked auctions.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5 text-sm font-semibold uppercase text-slate-900">
                <div className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-2 shadow-[2px_2px_0px_#0f172a]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total Tradera sum
                  </div>
                  <div className="text-xl font-black">{formatSek(traderaTotal)}</div>
                </div>
                {isAdmin ? (
                  <ul className="space-y-2">
                    {Object.entries(traderaTotalsByCondition).map(([condition, total]) => (
                      <li
                        key={condition}
                        className="flex items-center justify-between rounded-2xl border-2 border-slate-900 bg-white px-3 py-2 shadow-[2px_2px_0px_#0f172a]"
                      >
                        <span>{condition}</span>
                        <span className="font-black">{formatSek(total)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between rounded-2xl border-2 border-slate-900 bg-slate-900 px-3 py-2 text-white shadow-[2px_2px_0px_#0f172a]">
                      <span>Average</span>
                      <span className="font-black">{formatSek(traderaStats.average)}</span>
                    </li>
                  </ul>
                ) : null}
              </CardContent>
            </UiCard>
            
            {/* PRODUCT DETAILS CARD */}
            <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
              <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
                <CardTitle className="text-lg font-black uppercase text-white">Product details</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                  Reference data for this specific card.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-5 text-sm font-medium text-slate-700">
                {productDetails.length > 0 ? (
                  <ul className="space-y-2">
                    {productDetails.map((line, index) => (
                      <li
                        key={index}
                        className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-2 leading-relaxed shadow-[2px_2px_0px_#0f172a]"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">No product details provided.</p>
                )}
              </CardContent>
            </UiCard>

          </div>

          {/* HIGHLIGHTS SIDEBAR */}
          <UiCard className="h-fit border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
            <CardHeader className="border-b-4 border-slate-900 bg-slate-900">
              <CardTitle className="text-lg font-black uppercase text-white">Highlights</CardTitle>
              <CardDescription className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                Quick facts at a glance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs font-semibold uppercase text-slate-900">
              <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                Era
                <div className="text-base font-black">{card.era || 'Unknown era'}</div>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                Set
                <div className="text-base font-black">{card.set_name || 'Unknown set'}</div>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                Language
                <div className="text-base font-black">{card.language || 'Unknown language'}</div>
              </div>
              <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                Card #
                <div className="text-base font-black">{card.card_number || 'N/A'}</div>
              </div>
            </CardContent>
          </UiCard>
        </div>
      </div>

      {isAdmin ? (
        <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
          <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
            <CardTitle className="text-lg font-black uppercase text-white">Linked Tradera auctions</CardTitle>
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
              Detailed list available only for admins.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            {auctions && auctions.length > 0 ? (
              <div className="space-y-3">
                {auctions.map((auction) => (
                  <article
                    key={auction.itemId}
                    className="rounded-2xl border-2 border-slate-900 bg-amber-50 p-3 shadow-[2px_2px_0px_#0f172a]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{auction.title}</h3>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Condition: {auction.itemCondition || 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right text-sm font-black text-slate-900">{formatSek(auction.price)}</div>
                    </div>
                    <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Ends: {new Date(auction.endDate).toLocaleString('sv-SE')}
                    </div>
                    {auction.itemUrl ? (
                      <a
                        href={auction.itemUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-black uppercase tracking-wide text-slate-900 underline"
                      >
                        Open auction
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-500">No linked Tradera auctions for this card yet.</p>
            )}
          </CardContent>
        </UiCard>
      ) : null}
    </div>
  )
}
