import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link2 } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchAuctionCardLinks, fetchUnlinkedAuctions, runTraderaLink, runTraderaParse } from '../lib/api'
import type { AuctionCardLink, TraderaLinkSummary, TraderaParseSummary, UnlinkedAuction } from '../lib/api'

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

const formatConfidence = (confidence: number | null): string => {
  if (confidence == null) return '—'
  return `${(confidence * 100).toFixed(1)}%`
}

const formatDetectedExpansion = (auction: UnlinkedAuction): string => {
  const parts = [auction.detectedExpansionName, auction.detectedExpansionCode].filter(Boolean)
  if (parts.length) return parts.join(' • ')
  return '—'
}

const buildDiagnostics = (auction: UnlinkedAuction): string[] => {
  const diagnostics: string[] = []

  if (!auction.title) diagnostics.push('Missing title')
  if (!auction.description) diagnostics.push('Missing description')
  if (!auction.detectedCollectorNumber) diagnostics.push('No card #')
  if (!auction.detectedExpansionName && !auction.detectedExpansionCode) diagnostics.push('No set match')
  if (!auction.pokemonEra) diagnostics.push('No era')
  if (!auction.pokemonLanguage) diagnostics.push('No language')
  if (!auction.itemCondition) diagnostics.push('No condition')

  return diagnostics
}

export function EnrichPage(): JSX.Element {
  const {
    data: linkData,
    isLoading: linksLoading,
    isError: linksError,
    refetch: refetchLinks
  } = useQuery<AuctionCardLink[]>({
    queryKey: ['linking-links'],
    queryFn: () => fetchAuctionCardLinks(500)
  })

  const {
    data: unlinkedData,
    isLoading: unlinkedLoading,
    isError: unlinkedError,
    refetch: refetchUnlinked
  } = useQuery<UnlinkedAuction[]>({
    queryKey: ['linking-unlinked'],
    queryFn: () => fetchUnlinkedAuctions(500)
  })

  const [traderaLimit, setTraderaLimit] = useState(500)
  const [parseSummary, setParseSummary] = useState<TraderaParseSummary | null>(null)
  const [linkSummary, setLinkSummary] = useState<TraderaLinkSummary | null>(null)
  const [parsePending, setParsePending] = useState(false)
  const [linkPending, setLinkPending] = useState(false)
  const [traderaError, setTraderaError] = useState<string | null>(null)

  const handleRunParse = async (): Promise<void> => {
    setTraderaError(null)
    setParsePending(true)
    try {
      const result = await runTraderaParse(traderaLimit)
      setParseSummary(result)
    } catch (e) {
      setTraderaError(`Parse failed: ${String(e)}`)
    } finally {
      setParsePending(false)
    }
  }

  const handleRunLink = async (): Promise<void> => {
    setTraderaError(null)
    setLinkPending(true)
    try {
      const result = await runTraderaLink(traderaLimit)
      setLinkSummary(result)
      await Promise.all([refetchLinks(), refetchUnlinked()])
    } catch (e) {
      setTraderaError(`Linking failed: ${String(e)}`)
    } finally {
      setLinkPending(false)
    }
  }

  const links = linkData ?? []
  const unlinkedAuctions = unlinkedData ?? []
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
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="inline-flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Auction links
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tradera Linking</CardTitle>
          <CardDescription>Review deterministic matches before writing links into the database.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Label htmlFor="tradera-limit">Limit</Label>
              <Input
                id="tradera-limit"
                type="number"
                min={1}
                max={5000}
                value={traderaLimit}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setTraderaLimit(Number.isFinite(value) ? value : 0)
                }}
                className="w-40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleRunParse} variant="secondary" disabled={parsePending || linkPending}>
                {parsePending ? 'Parsing…' : 'Parse auctions (dry run)'}
              </Button>
              <Button onClick={handleRunLink} disabled={parsePending || linkPending}>
                {linkPending ? 'Linking…' : 'Link auctions'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            Only deterministic matches are linked. Bundles and unclear titles are skipped.
          </div>

          {traderaError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
              {traderaError}
            </div>
          ) : null}

          {parseSummary ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total parsed</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {parseSummary.total.toLocaleString('sv-SE')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">With card #</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {parseSummary.withCollectorKey.toLocaleString('sv-SE')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">With set hints</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {parseSummary.withSetHints.toLocaleString('sv-SE')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Bundles</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {parseSummary.bundles.toLocaleString('sv-SE')}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Example card numbers
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {parseSummary.examples.collectorKey.map((example) => (
                      <li key={example.itemId}>
                        <span className="font-semibold">#{example.itemId}</span> — {example.title ?? 'Untitled'}
                      </li>
                    ))}
                  </ul>
                </details>

                <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Example set hints
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {parseSummary.examples.setHints.map((example) => (
                      <li key={example.itemId}>
                        <span className="font-semibold">#{example.itemId}</span> — {example.title ?? 'Untitled'}
                        {example.setHint ? ` (${example.setHint})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>

                <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Example bundles
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {parseSummary.examples.bundles.map((example) => (
                      <li key={example.itemId}>
                        <span className="font-semibold">#{example.itemId}</span> — {example.title ?? 'Untitled'}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          ) : null}

          {linkSummary ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Linked</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {linkSummary.linked.toLocaleString('sv-SE')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Skipped</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {linkSummary.skipped.toLocaleString('sv-SE')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Scanned</p>
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                    {linkSummary.scanned.toLocaleString('sv-SE')}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Skip reasons</p>
                <ul className="mt-2 space-y-1">
                  {Object.entries(linkSummary.skipReasons).length ? (
                    Object.entries(linkSummary.skipReasons).map(([reason, count]) => (
                      <li key={reason}>
                        <span className="font-semibold">{reason}</span>: {count}
                      </li>
                    ))
                  ) : (
                    <li>No skips.</li>
                  )}
                </ul>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-900/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Item</TableHead>
                      <TableHead className="text-left">Auction title</TableHead>
                      <TableHead className="text-left">Card</TableHead>
                      <TableHead className="text-left">Set</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkSummary.linkedExamples.length ? (
                      linkSummary.linkedExamples.map((example) => (
                        <TableRow key={`${example.itemId}-${example.cardId}`}>
                          <TableCell className="text-left text-slate-700 dark:text-slate-200">
                            #{example.itemId}
                          </TableCell>
                          <TableCell className="text-left text-slate-700 dark:text-slate-200">
                            {example.title ?? 'Untitled'}
                          </TableCell>
                          <TableCell className="text-left text-slate-700 dark:text-slate-200">
                            {example.cardName ?? 'Unknown'} (#{example.cardId})
                          </TableCell>
                          <TableCell className="text-left text-slate-700 dark:text-slate-200">
                            {example.setName ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                          No linked examples returned.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
                {linksLoading ? 'Loading…' : linksError ? 'Error' : 'Ready'}
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
                  <TableHead className="text-left">Confidence</TableHead>
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
                        {formatConfidence(link.confidence)}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {link.linkedAt ? format(new Date(link.linkedAt), 'PPpp') : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                      {linksLoading ? 'Loading auction links…' : 'No auction links found.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Not enriched auctions</CardTitle>
            <CardDescription>Auctions without a card link in tradera_auction_card_links.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{unlinkedAuctions.length.toLocaleString('sv-SE')} showing</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-900/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Auction</TableHead>
                  <TableHead className="text-left">Seller</TableHead>
                  <TableHead className="text-left">Price</TableHead>
                  <TableHead className="text-left">Bids</TableHead>
                  <TableHead className="text-left">Ended</TableHead>
                  <TableHead className="text-left">Era</TableHead>
                  <TableHead className="text-left">Language</TableHead>
                  <TableHead className="text-left">Condition</TableHead>
                  <TableHead className="text-left">Detected card #</TableHead>
                  <TableHead className="text-left">Detected set</TableHead>
                  <TableHead className="text-left">Diagnostics</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unlinkedAuctions.length ? (
                  unlinkedAuctions.map((auction) => {
                    const diagnostics = buildDiagnostics(auction)

                    return (
                      <TableRow key={auction.itemId}>
                      <TableCell className="text-left">
                        <div className="space-y-1">
                          {auction.itemUrl ? (
                            <a
                              href={auction.itemUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-indigo-600 hover:underline"
                            >
                              {auction.title ?? `Auction #${auction.itemId}`}
                            </a>
                          ) : (
                            <p className="font-semibold text-slate-900 dark:text-slate-50">
                              {auction.title ?? `Auction #${auction.itemId}`}
                            </p>
                          )}
                          <p className="text-xs text-slate-600 dark:text-slate-400">Item #{auction.itemId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.sellerAlias ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.price != null ? `${auction.price.toFixed(0)} SEK` : '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.bidCount ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.endDate ? format(new Date(auction.endDate), 'PPpp') : '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.pokemonEra ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.pokemonLanguage ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.itemCondition ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {auction.detectedCollectorNumber ?? '—'}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        {formatDetectedExpansion(auction)}
                      </TableCell>
                      <TableCell className="text-left">
                        {diagnostics.length ? (
                          <div className="flex flex-wrap gap-2">
                            {diagnostics.map((note) => (
                              <Badge key={note} variant="secondary" className="whitespace-nowrap">
                                {note}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="outline">Ready to link</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-slate-500">
                      {unlinkedLoading
                        ? 'Loading unlinked auctions…'
                        : unlinkedError
                          ? 'Unable to load unlinked auctions.'
                          : 'No unlinked auctions found.'}
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
