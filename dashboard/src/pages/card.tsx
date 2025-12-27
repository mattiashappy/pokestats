import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '../components/ui/button'
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchCard } from '../lib/api'

export function CardPage(): JSX.Element {
  const { id } = useParams()
  const cardId = Number(id)

  const { data, isLoading, error } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => fetchCard(cardId),
    enabled: Number.isFinite(cardId)
  })

  const title = useMemo(() => data?.card?.name ?? 'Card', [data?.card?.name])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/auctions">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
          {data?.card ? (
            <CardDescription className="text-sm text-slate-600 dark:text-slate-400">
              Era: {data.card.era || 'Unknown era'} · Set: {data.card.set_name || 'Unknown set'} · Card number:{' '}
              {data.card.card_number || 'N/A'}
            </CardDescription>
          ) : null}
        </div>
      </div>

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
          ) : !data ? (
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
                  {data.auctions.map((auction) => (
                    <TableRow key={auction.id}>
                      <TableCell className="w-24">
                        <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                          {auction.thumbnail ? (
                            <img src={auction.thumbnail} alt={auction.cardName} className="h-16 w-full object-cover" />
                          ) : (
                            <div className="flex h-16 w-full items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                              No image
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-start gap-2">
                          <div>
                            <div className="text-slate-900 dark:text-slate-100">{auction.cardName}</div>
                            {auction.cardName !== auction.title ? (
                              <div className="text-xs font-normal text-slate-600 dark:text-slate-400">{auction.title}</div>
                            ) : null}
                            <div className="text-xs text-slate-500 dark:text-slate-400">Set: {auction.cardSetName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{auction.cardEra}</TableCell>
                      <TableCell className="text-right text-slate-900 dark:text-slate-100">
                        {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: auction.currency }).format(auction.finalPrice)}
                      </TableCell>
                      <TableCell className="text-center">{auction.bids}</TableCell>
                      <TableCell>
                        <div className="text-slate-900 dark:text-slate-100">{new Date(auction.endTime).toLocaleString()}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">{formatDistanceToNow(parseISO(auction.endTime), { addSuffix: true })}</div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={auction.url}
                          className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </UiCard>
    </div>
  )
}
