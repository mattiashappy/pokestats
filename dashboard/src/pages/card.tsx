import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '../components/ui/button'
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchCardAuctions, fetchCardDetails } from '../lib/api'
import { normalizeEraCode } from '../lib/era'

export function CardPage(): JSX.Element {
  const { id, eraCode, setCode } = useParams()
  const cardId = Number(id)

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError
  } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => fetchCardDetails(cardId),
    enabled: Number.isFinite(cardId)
  })

  const {
    data: auctions,
    isLoading: isLoadingAuctions,
    error: auctionsError
  } = useQuery({
    queryKey: ['card', cardId, 'auctions'],
    queryFn: () => fetchCardAuctions(cardId),
    enabled: Number.isFinite(cardId)
  })

  const title = useMemo(() => card?.name ?? 'Card', [card?.name])
  const headerLabel = useMemo(() => {
    if (card?.set_code && card?.card_number) return `${card.set_code} ${card.card_number}`
    if (card?.card_number) return card.card_number
    return title
  }, [card?.set_code, card?.card_number, title])

  const productDetails = useMemo(() => {
    if (!card?.product_details) return []
    return card.product_details
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }, [card?.product_details])

  const isLoading = isLoadingCard || isLoadingAuctions
  const error = cardError || auctionsError

  const resolvedEraCode = normalizeEraCode(eraCode ?? null)
  const resolvedSetCode = setCode ?? card?.set_code ?? null
  const backLink = resolvedEraCode && resolvedSetCode
    ? `/era/${resolvedEraCode}/${resolvedSetCode}`
    : card?.set_code
      ? `/era/sets/${card.set_code}`
      : '/era'
  const backLabel = resolvedSetCode ? `Back to ${resolvedSetCode}` : 'Back to era sets'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={backLink}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
          </Link>
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{headerLabel}</h1>
          {card ? (
            <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
              Name: {card.name || 'Unknown name'} · Era: {card.era || 'Unknown era'} · Set: {card.set_name || 'Unknown set'} ·
              Set code: {card.set_code || 'N/A'} · Card number: {card.card_number || 'N/A'}
            </CardDescription>
          ) : null}
        </div>
      </div>

      {card ? (
        <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
          <UiCard className="overflow-hidden">
            <CardHeader>
              <CardTitle>{card.name}</CardTitle>
              <CardDescription>
                {card.set_name || 'Unknown set'} · {card.era || 'Unknown era'}
                {card.card_number ? ` · ${card.card_number}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                {card.image_url ? (
                  <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-64 items-center justify-center bg-slate-100 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    No image available
                  </div>
                )}
              </div>
            </CardContent>
          </UiCard>

          <UiCard>
            <CardHeader>
              <CardTitle>Product details</CardTitle>
              <CardDescription>Reference data for this specific card.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
              {productDetails.length > 0 ? (
                <ul className="space-y-2">
                  {productDetails.map((line, index) => (
                    <li key={index} className="leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">No product details provided.</p>
              )}
            </CardContent>
          </UiCard>
        </div>
      ) : null}

      <UiCard>
        <CardHeader>
          <CardTitle>Auctions</CardTitle>
          <CardDescription>All auctions linked to this card.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading card…
            </div>
          ) : error ? (
            <p className="text-sm text-rose-400">Failed to load card.</p>
          ) : !card ? (
            <p className="text-sm text-slate-400">Card not found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Picture</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Era</TableHead>
                    <TableHead className="text-right">Final price</TableHead>
                    <TableHead className="text-center">Bids</TableHead>
                    <TableHead>Ended at</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auctions?.map((auction) => {
                    return (
                      <TableRow key={auction.itemId}>
                        <TableCell className="w-24">
                          <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                            {auction.thumbnailUrl ? (
                              <img src={auction.thumbnailUrl} alt={auction.title} className="h-16 w-full object-cover" />
                            ) : (
                              <div className="flex h-16 w-full items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                                No image
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                          {auction.title}
                        </TableCell>
                        <TableCell>{auction.pokemonEra || card?.era || 'Unknown era'}</TableCell>
                        <TableCell className="text-right text-slate-900 dark:text-slate-100">
                          {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: auction.currency }).format(auction.price)}
                        </TableCell>
                        <TableCell className="text-center">{auction.bidCount}</TableCell>
                        <TableCell>
                          <div className="text-slate-900 dark:text-slate-100">{new Date(auction.endDate).toLocaleString()}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">{formatDistanceToNow(parseISO(auction.endDate), { addSuffix: true })}</div>
                        </TableCell>
                        <TableCell>
                          <a
                            href={auction.itemUrl}
                            className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                            target="_blank"
                            rel="noreferrer"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </UiCard>
    </div>
  )
}
