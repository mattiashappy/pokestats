import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '../components/ui/button'
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import DataTable from '../components/ui/data-table'
import { fetchCardAuctions, fetchCardDetails } from '../lib/api'
import { getCardSetIdentifier } from '../lib/sets'

export function CardPage(): JSX.Element {
  const { id, setCode } = useParams()

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError
  } = useQuery({
    queryKey: ['card', id],
    queryFn: () => fetchCardDetails(id ?? ''),
    enabled: Boolean(id)
  })

  const {
    data: auctions,
    isLoading: isLoadingAuctions,
    error: auctionsError
  } = useQuery({
    queryKey: ['card', id, 'auctions'],
    queryFn: () => fetchCardAuctions(id ?? ''),
    enabled: Boolean(id)
  })

  const title = useMemo(() => card?.name ?? 'Card', [card?.name])
  const headerLabel = useMemo(() => {
    const cardSetIdentifier = card ? getCardSetIdentifier(card) : null
    if (cardSetIdentifier && card?.card_number) return `${cardSetIdentifier} ${card.card_number}`
    if (card?.card_number) return card.card_number
    return title
  }, [card, title])

  const productDetails = useMemo(() => {
    if (!card?.product_details) return []
    return card.product_details
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }, [card?.product_details])

  const isLoading = isLoadingCard || isLoadingAuctions
  const error = cardError || auctionsError

  const resolvedSetCode = setCode ?? (card ? getCardSetIdentifier(card) : null)
  const backLink = resolvedSetCode ? `/sets/${resolvedSetCode}` : '/sets'
  const backLabel = resolvedSetCode ? `Back to ${resolvedSetCode}` : 'Back to sets'

  const cardSetIdentifier = card ? getCardSetIdentifier(card) : null

  return (
    <div className="space-y-8">
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">Card</p>
          <h1 className="text-4xl font-black uppercase text-slate-900">{headerLabel}</h1>
          {card ? (
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
                Set code: {cardSetIdentifier || 'N/A'}
              </span>
              <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
                Card number: {card.card_number || 'N/A'}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {card ? (
        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <UiCard className="overflow-hidden border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
            <CardHeader className="space-y-1 border-b-4 border-slate-900 bg-slate-900">
              <CardTitle className="text-lg font-black uppercase text-white">{card.name}</CardTitle>
              <CardDescription className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                {card.set_name || 'Unknown set'} · {card.era || 'Unknown era'}
                {card.card_number ? ` · ${card.card_number}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-hidden border-4 border-slate-900 bg-white shadow-[4px_4px_0px_#0f172a]">
                {card.image_url ? (
                  <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-64 items-center justify-center bg-amber-50 text-sm font-semibold uppercase tracking-wide text-slate-600">
                    No image available
                  </div>
                )}
              </div>
            </CardContent>
          </UiCard>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr),240px]">
            <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
              <CardHeader className="border-b-4 border-slate-900 bg-amber-100">
                <CardTitle className="text-lg font-black uppercase text-slate-900">Product details</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-700">
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

            <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
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
                  Card #
                  <div className="text-base font-black">{card.card_number || 'N/A'}</div>
                </div>
              </CardContent>
            </UiCard>
          </div>
        </div>
      ) : null}

      <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
        <CardHeader className="border-b-4 border-slate-900 bg-amber-100">
          <CardTitle className="text-lg font-black uppercase text-slate-900">Auctions</CardTitle>
          <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            All auctions linked to this card.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 px-6 py-5 text-sm font-semibold text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading card…
            </div>
          ) : error ? (
            <p className="px-6 py-5 text-sm font-semibold text-rose-500">Failed to load card.</p>
          ) : !card ? (
            <p className="px-6 py-5 text-sm font-semibold text-slate-500">Card not found.</p>
          ) : (
            <DataTable>
              <thead className="bg-amber-200">
                <tr className="border-b-4 border-slate-900 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                  <th className="px-3 py-2">Picture</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Era</th>
                  <th className="px-3 py-2 text-right">Final price</th>
                  <th className="px-3 py-2 text-center">Bids</th>
                  <th className="px-3 py-2">Ended at</th>
                  <th className="px-3 py-2">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y-4 divide-slate-900">
                {auctions?.map((auction) => {
                  return (
                    <tr key={auction.itemId} className="bg-white">
                      <td className="w-28 px-3 py-3">
                        <div className="overflow-hidden border-2 border-slate-900 bg-white shadow-[2px_2px_0px_#0f172a]">
                          {auction.thumbnailUrl ? (
                            <img src={auction.thumbnailUrl} alt={auction.title} className="h-16 w-full object-cover" />
                          ) : (
                            <div className="flex h-16 w-full items-center justify-center bg-amber-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                              No image
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{auction.title}</td>
                      <td className="px-3 py-3">{auction.pokemonEra || card?.era || 'Unknown era'}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: auction.currency }).format(auction.price)}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-900">{auction.bidCount}</td>
                      <td className="px-3 py-3">
                        <div className="text-slate-900">{new Date(auction.endDate).toLocaleString()}</div>
                        <div className="text-xs text-slate-600">
                          {formatDistanceToNow(parseISO(auction.endDate), { addSuffix: true })}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <a
                          href={auction.itemUrl}
                          className="inline-flex items-center gap-1 border-2 border-slate-900 bg-white px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[2px_2px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </CardContent>
      </UiCard>
    </div>
  )
}
