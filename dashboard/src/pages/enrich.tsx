import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link2 } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchAuctionCardLinks } from '../lib/api'
import type { AuctionCardLink } from '../lib/api'

const formatCardLabel = (link: AuctionCardLink): string => {
  const parts = [link.cardName, link.cardNumber].filter(Boolean)
  if (parts.length) return parts.join(' • ')
  return link.cardId ? `Card #${link.cardId}` : '—'
}

const formatSetLabel = (link: AuctionCardLink): string => {
  const parts = [link.setName, link.setCode].filter(Boolean)
  if (parts.length) return parts.join(' • ')
  return '—'
}

export function EnrichPage(): JSX.Element {
  const { data, isLoading, isError } = useQuery<AuctionCardLink[]>({
    queryKey: ['linking-links'],
    queryFn: () => fetchAuctionCardLinks(500)
  })

  const links = data ?? []
  const counts = useMemo(() => {
    const total = links.length
    const withAuction = links.filter((link) => link.auctionTitle).length
    const withCard = links.filter((link) => link.cardName).length
    return { total, withAuction, withCard }
  }, [links])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Enrich</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Review how Tradera auctions are linked to cards and track enrichment coverage.
          </p>
        </div>
        <Badge variant="secondary" className="inline-flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Auction links
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-indigo-500" />
              Auction-to-card links
            </CardTitle>
            <CardDescription>Snapshots of the enrichment table linking auctions to cards.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{counts.total.toLocaleString('sv-SE')} total</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Linked auctions</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {counts.withAuction.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Rows with auction metadata.</p>
            </div>

            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Linked cards</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {counts.withCard.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Rows with card metadata.</p>
            </div>

            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {isLoading ? 'Loading…' : isError ? 'Error' : 'Ready'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Current fetch status.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-900/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Auction</TableHead>
                  <TableHead className="text-left">Card</TableHead>
                  <TableHead className="text-left">Set</TableHead>
                  <TableHead className="text-left">Method</TableHead>
                  <TableHead className="text-left">Status</TableHead>
                  <TableHead className="text-left">Linked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.length ? (
                  links.map((link) => (
                    <TableRow key={`${link.itemId}-${link.cardId}`}>
                      <TableCell className="text-left">
                        <div className="space-y-1">
                          {link.auctionUrl ? (
                            <a
                              href={link.auctionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-indigo-600 hover:underline"
                            >
                              {link.auctionTitle ?? `Auction #${link.itemId}`}
                            </a>
                          ) : (
                            <p className="font-semibold text-slate-900 dark:text-slate-50">
                              {link.auctionTitle ?? `Auction #${link.itemId}`}
                            </p>
                          )}
                          <p className="text-xs text-slate-600 dark:text-slate-400">Item #{link.itemId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-left text-slate-700 dark:text-slate-200">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900 dark:text-slate-50">{formatCardLabel(link)}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Card #{link.cardId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {formatSetLabel(link)}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {link.method ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {link.status ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {link.linkedAt ? format(new Date(link.linkedAt), 'PPpp') : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                      {isLoading ? 'Loading auction links…' : 'No auction links found.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
