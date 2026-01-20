import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link2 } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchAuctionCardLinks,
  fetchLinkingStats,
  fetchUnlinkedAuctions,
  linkAuctionToCard,
  runAiMatch,
  runTraderaLink,
  searchCards
} from '../lib/api'
import type {
  AiMatchSummary,
  AuctionCardLink,
  CardSearchResult,
  LinkingStats,
  TraderaLinkSummary,
  UnlinkedAuction
} from '../lib/api'

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

const normalizeLanguage = (language?: string | null): string => {
  const trimmed = language?.trim()
  if (!trimmed) return 'Unknown'
  return trimmed
}

const orderedSkipReasons = [
  'card_not_unique',
  'bundle_or_bulk',
  'missing_collector_key',
  'missing_set_hint',
  'set_total_mismatch',
  'special_product_line',
  'non_tcg_topps'
]

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
    queryFn: () => fetchAuctionCardLinks()
  })

  const {
    data: unlinkedData,
    isLoading: unlinkedLoading,
    isError: unlinkedError,
    refetch: refetchUnlinked
  } = useQuery<UnlinkedAuction[]>({
    queryKey: ['linking-unlinked'],
    queryFn: () => fetchUnlinkedAuctions()
  })
  const { data: linkingStats } = useQuery<LinkingStats>({
    queryKey: ['linking-stats'],
    queryFn: fetchLinkingStats
  })

  const [linkSummary, setLinkSummary] = useState<TraderaLinkSummary | null>(null)
  const [linkPending, setLinkPending] = useState(false)
  const [traderaError, setTraderaError] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<AiMatchSummary | null>(null)
  const [aiPending, setAiPending] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiProgress, setAiProgress] = useState<{ completed: number; total: number } | null>(null)
  const [selectedAiAuctionIds, setSelectedAiAuctionIds] = useState<number[]>([])
  const [selectedSkipReason, setSelectedSkipReason] = useState('set_total_mismatch')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedAuction, setSelectedAuction] = useState<UnlinkedAuction | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [manualLinkPending, setManualLinkPending] = useState(false)
  const [manualLinkError, setManualLinkError] = useState<string | null>(null)
  const [manualLinkSuccess, setManualLinkSuccess] = useState<string | null>(null)
  const [activeLinkView, setActiveLinkView] = useState<'linked' | 'unlinked' | 'ready'>('linked')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [unlinkedPage, setUnlinkedPage] = useState(1)

  const pageSize = 50

  const handleRunLink = async (): Promise<void> => {
    setTraderaError(null)
    setLinkPending(true)
    try {
      const result = await runTraderaLink()
      setLinkSummary(result)
      await Promise.all([refetchLinks(), refetchUnlinked()])
    } catch (e) {
      setTraderaError(`Linking failed: ${String(e)}`)
    } finally {
      setLinkPending(false)
    }
  }

  const runAiMatchForIds = async (auctionIds: number[]): Promise<void> => {
    if (!auctionIds.length) return
    setAiError(null)
    setAiPending(true)
    setAiSummary(null)
    setAiProgress({ completed: 0, total: auctionIds.length })
    try {
      const batchSize = 10
      const batches = []
      for (let i = 0; i < auctionIds.length; i += batchSize) {
        batches.push(auctionIds.slice(i, i + batchSize))
      }

      const combined: AiMatchSummary = {
        scanned: 0,
        matched: 0,
        skipped: 0,
        skipReasons: {},
        matchedExamples: []
      }

      for (const batch of batches) {
        const result = await runAiMatch(batch)
        combined.scanned += result.scanned
        combined.matched += result.matched
        combined.skipped += result.skipped
        for (const [reason, count] of Object.entries(result.skipReasons)) {
          combined.skipReasons[reason] = (combined.skipReasons[reason] || 0) + count
        }
        combined.matchedExamples.push(...result.matchedExamples)
        setAiProgress((prev) =>
          prev ? { ...prev, completed: Math.min(prev.total, prev.completed + batch.length) } : prev
        )
      }

      setAiSummary(combined)
      await Promise.all([refetchLinks(), refetchUnlinked()])
    } catch (error) {
      setAiError(`AI matching failed: ${String(error)}`)
    } finally {
      setAiPending(false)
      setAiProgress(null)
    }
  }

  const handleRunAiMatch = async (): Promise<void> => {
    if (!selectedAiAuctionIds.length) return
    await runAiMatchForIds(selectedAiAuctionIds)
    setSelectedAiAuctionIds([])
  }

  const handleRunAllAiMatch = async (): Promise<void> => {
    const allIds = unlinkedAuctions.map((auction) => auction.itemId)
    if (!allIds.length) return
    const confirmed = window.confirm(
      `Run AI matching for all ${allIds.length.toLocaleString('sv-SE')} unlinked auctions?`
    )
    if (!confirmed) return
    setSelectedAiAuctionIds([])
    await runAiMatchForIds(allIds)
  }

  const links = linkData ?? []
  const unlinkedAuctions = unlinkedData ?? []
  const sortedUnlinkedAuctions = useMemo(() => {
    return [...unlinkedAuctions].sort((left, right) => {
      const leftTitle = left.title?.trim() ?? ''
      const rightTitle = right.title?.trim() ?? ''
      const titleOrder = leftTitle.localeCompare(rightTitle, 'sv-SE', { sensitivity: 'base' })
      if (titleOrder !== 0) return titleOrder
      return left.itemId - right.itemId
    })
  }, [unlinkedAuctions])
  const sortedReadyToLinkAuctions = useMemo(() => {
    return sortedUnlinkedAuctions.filter((auction) => buildDiagnostics(auction).length === 0)
  }, [sortedUnlinkedAuctions])
  const {
    data: cardSearchResults,
    isLoading: cardSearchLoading,
    isError: cardSearchError
  } = useQuery<CardSearchResult[]>({
    queryKey: ['card-search', searchQuery],
    queryFn: () => searchCards(searchQuery, 50, 'database'),
    enabled: searchOpen && Boolean(searchQuery)
  })
  const counts = useMemo(() => {
    const linkedCards = links.filter((link) => link.cardId).length
    return {
      linkedCards,
      unlinkedCards: linkingStats?.unlinked ?? unlinkedAuctions.length,
      readyToLink: sortedReadyToLinkAuctions.length
    }
  }, [links, linkingStats?.unlinked, unlinkedAuctions.length, sortedReadyToLinkAuctions.length])
  const visibleUnlinkedAuctions = useMemo(() => {
    const base = activeLinkView === 'ready' ? sortedReadyToLinkAuctions : sortedUnlinkedAuctions
    if (languageFilter === 'all') return base
    const normalizedFilter = languageFilter.toLowerCase()
    return base.filter((auction) => {
      const normalizedLanguage = normalizeLanguage(auction.pokemonLanguage).toLowerCase()
      return normalizedLanguage === normalizedFilter
    })
  }, [activeLinkView, languageFilter, sortedReadyToLinkAuctions, sortedUnlinkedAuctions])
  const pagedUnlinkedAuctions = useMemo(() => {
    const start = (unlinkedPage - 1) * pageSize
    return visibleUnlinkedAuctions.slice(start, start + pageSize)
  }, [pageSize, unlinkedPage, visibleUnlinkedAuctions])
  const visiblePageIds = useMemo(() => pagedUnlinkedAuctions.map((auction) => auction.itemId), [pagedUnlinkedAuctions])
  const selectedAiSet = useMemo(() => new Set(selectedAiAuctionIds), [selectedAiAuctionIds])
  const allPageSelected = visiblePageIds.length > 0 && visiblePageIds.every((id) => selectedAiSet.has(id))
  const totalUnlinkedPages = Math.max(1, Math.ceil(visibleUnlinkedAuctions.length / pageSize))
  const activeCount = activeLinkView === 'linked'
    ? counts.linkedCards
    : activeLinkView === 'ready'
      ? counts.readyToLink
      : counts.unlinkedCards
  const activeCountLabel = activeLinkView === 'linked'
    ? 'linked cards'
    : activeLinkView === 'ready'
      ? 'ready to link'
      : 'unlinked auctions'
  const skipReasonEntries = useMemo(() => {
    if (!linkSummary) return []
    const knownReasons = orderedSkipReasons.map((reason) => [reason, linkSummary.skipReasons[reason] ?? 0] as const)
    const additionalReasons = Object.entries(linkSummary.skipReasons).filter(
      ([reason]) => !orderedSkipReasons.includes(reason)
    )
    return [...knownReasons, ...additionalReasons]
  }, [linkSummary])
  const skipReasonOptions = useMemo(() => {
    if (!linkSummary) return []
    return skipReasonEntries.filter(([, count]) => count > 0).map(([reason]) => reason)
  }, [linkSummary, skipReasonEntries])
  const skipReasonRows = useMemo(() => {
    if (!linkSummary) return []
    return linkSummary.skippedExamples?.[selectedSkipReason] ?? []
  }, [linkSummary, selectedSkipReason])

  const languageOptions = useMemo(() => {
    const values = new Set<string>()
    sortedUnlinkedAuctions.forEach((auction) => {
      values.add(normalizeLanguage(auction.pokemonLanguage))
    })
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'sv-SE'))
  }, [sortedUnlinkedAuctions])

  useEffect(() => {
    if (!skipReasonOptions.length) return
    if (skipReasonOptions.includes('set_total_mismatch')) {
      setSelectedSkipReason('set_total_mismatch')
      return
    }
    setSelectedSkipReason(skipReasonOptions[0])
  }, [skipReasonOptions])

  useEffect(() => {
    if (searchOpen) return
    setSelectedAuction(null)
    setSearchTerm('')
    setSearchQuery('')
    setManualLinkError(null)
    setManualLinkSuccess(null)
  }, [searchOpen])

  useEffect(() => {
    setUnlinkedPage(1)
    if (activeLinkView === 'linked') {
      setSelectedAiAuctionIds([])
    }
  }, [activeLinkView, languageFilter])

  useEffect(() => {
    if (unlinkedPage <= totalUnlinkedPages) return
    setUnlinkedPage(totalUnlinkedPages)
  }, [totalUnlinkedPages, unlinkedPage])

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setManualLinkError(null)
    setManualLinkSuccess(null)
    setSearchQuery(searchTerm.trim())
  }

  const handleOpenSearch = (auction: UnlinkedAuction): void => {
    setSelectedAuction(auction)
    setSearchOpen(true)
    setManualLinkError(null)
    setManualLinkSuccess(null)
  }

  const handleManualLink = async (cardId: string): Promise<void> => {
    if (!selectedAuction) return
    setManualLinkPending(true)
    setManualLinkError(null)
    setManualLinkSuccess(null)
    try {
      await linkAuctionToCard(selectedAuction.itemId, cardId)
      setManualLinkSuccess(`Linked auction #${selectedAuction.itemId} to card #${cardId}.`)
      await Promise.all([refetchLinks(), refetchUnlinked()])
      setSearchOpen(false)
    } catch (error) {
      setManualLinkError(`Link failed: ${String(error)}`)
    } finally {
      setManualLinkPending(false)
    }
  }

  const toggleAiSelection = (auctionId: number): void => {
    setSelectedAiAuctionIds((prev) => {
      if (prev.includes(auctionId)) {
        return prev.filter((id) => id !== auctionId)
      }
      return [...prev, auctionId]
    })
  }

  const toggleSelectAllPage = (): void => {
    setSelectedAiAuctionIds((prev) => {
      if (allPageSelected) {
        return prev.filter((id) => !visiblePageIds.includes(id))
      }
      const next = new Set(prev)
      visiblePageIds.forEach((id) => next.add(id))
      return Array.from(next)
    })
  }

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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Linking runs across all unlinked auctions.
            </p>
            <Button onClick={handleRunLink} disabled={linkPending}>
              {linkPending ? 'Linking…' : 'Link auctions'}
            </Button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            Only deterministic matches are linked. Bundles and unclear titles are skipped.
          </div>

          {traderaError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
              {traderaError}
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
                  {skipReasonEntries.length ? (
                    skipReasonEntries.map(([reason, count]) => (
                      <li key={reason}>
                        <span className="font-semibold">{reason}</span>: {count}
                      </li>
                    ))
                  ) : (
                    <li>No skips.</li>
                  )}
                </ul>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skipped auctions</p>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Reason
                    <select
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                      value={selectedSkipReason}
                      onChange={(event) => setSelectedSkipReason(event.target.value)}
                    >
                      {skipReasonOptions.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left">Item</TableHead>
                        <TableHead className="text-left">Auction title</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {skipReasonRows.length ? (
                        skipReasonRows.map((example) => (
                          <TableRow key={`${selectedSkipReason}-${example.itemId}`}>
                            <TableCell className="text-left text-slate-700 dark:text-slate-200">
                              #{example.itemId}
                            </TableCell>
                            <TableCell className="text-left text-slate-700 dark:text-slate-200">
                              {example.title ?? 'Untitled'}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-sm text-slate-500">
                            No skipped auctions for this reason.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
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
        <CardHeader>
          <CardTitle>AI Matching</CardTitle>
          <CardDescription>
            Run the AI model on selected unlinked auctions so you control spend and scope. Requests are batched
            to avoid timeouts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {selectedAiAuctionIds.length
                ? `${selectedAiAuctionIds.length.toLocaleString('sv-SE')} auction(s) selected.`
                : 'Select auctions from the list below to run the AI matcher.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleRunAiMatch} disabled={aiPending || selectedAiAuctionIds.length === 0}>
                {aiPending ? 'Matching…' : 'Run AI matching'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleRunAllAiMatch}
                disabled={aiPending || !unlinkedAuctions.length}
              >
                Run all unlinked
              </Button>
            </div>
          </div>

          {aiProgress ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
              Processed {aiProgress.completed.toLocaleString('sv-SE')} of{' '}
              {aiProgress.total.toLocaleString('sv-SE')} selected auctions.
            </div>
          ) : null}

          {aiError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
              {aiError}
            </div>
          ) : null}

          {aiSummary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Matched</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {aiSummary.matched.toLocaleString('sv-SE')}
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Skipped</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {aiSummary.skipped.toLocaleString('sv-SE')}
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Scanned</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {aiSummary.scanned.toLocaleString('sv-SE')}
                </p>
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
            <Badge variant="outline">
              {activeCount.toLocaleString('sv-SE')} {activeCountLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setActiveLinkView('linked')}
              className={`rounded-lg p-3 text-left text-sm text-slate-700 transition dark:text-slate-200 ${
                activeLinkView === 'linked'
                  ? 'bg-white shadow-sm ring-2 ring-indigo-500 dark:bg-slate-950/70'
                  : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-900/60 dark:hover:bg-slate-900'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">Linked cards</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {counts.linkedCards.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Rows with card metadata.</p>
            </button>

            <button
              type="button"
              onClick={() => setActiveLinkView('unlinked')}
              className={`rounded-lg p-3 text-left text-sm text-slate-700 transition dark:text-slate-200 ${
                activeLinkView === 'unlinked'
                  ? 'bg-white shadow-sm ring-2 ring-indigo-500 dark:bg-slate-950/70'
                  : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-900/60 dark:hover:bg-slate-900'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">Not Linked Cards</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {counts.unlinkedCards.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Auctions that are not linked.</p>
            </button>

            <button
              type="button"
              onClick={() => setActiveLinkView('ready')}
              className={`rounded-lg p-3 text-left text-sm text-slate-700 transition dark:text-slate-200 ${
                activeLinkView === 'ready'
                  ? 'bg-white shadow-sm ring-2 ring-indigo-500 dark:bg-slate-950/70'
                  : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-900/60 dark:hover:bg-slate-900'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">Ready to Link</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {counts.readyToLink.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Auctions that are ready to link.</p>
            </button>
          </div>

          {activeLinkView === 'linked' ? (
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
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-900/80">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-3">
                  <Label htmlFor="language-filter" className="text-xs uppercase tracking-wide text-slate-500">
                    Language
                  </Label>
                  <select
                    id="language-filter"
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    value={languageFilter}
                    onChange={(event) => setLanguageFilter(event.target.value)}
                  >
                    <option value="all">All languages</option>
                    {languageOptions.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={allPageSelected}
                      onChange={toggleSelectAllPage}
                      aria-label="Select all auctions on this page"
                    />
                    <span>Select page</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    Showing {(pagedUnlinkedAuctions.length
                      ? (unlinkedPage - 1) * pageSize + 1
                      : 0).toLocaleString('sv-SE')}
                    –
                    {Math.min(unlinkedPage * pageSize, visibleUnlinkedAuctions.length).toLocaleString('sv-SE')} of{' '}
                    {visibleUnlinkedAuctions.length.toLocaleString('sv-SE')}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={unlinkedPage <= 1}
                      onClick={() => setUnlinkedPage((prev) => Math.max(1, prev - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={unlinkedPage >= totalUnlinkedPages}
                      onClick={() => setUnlinkedPage((prev) => Math.min(totalUnlinkedPages, prev + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-left">Select</TableHead>
                    <TableHead className="text-left">Auction</TableHead>
                    <TableHead className="text-left">Era</TableHead>
                    <TableHead className="text-left">Language</TableHead>
                    <TableHead className="text-left">Condition</TableHead>
                    <TableHead className="text-left">Detected card #</TableHead>
                    <TableHead className="text-left">Detected set</TableHead>
                    <TableHead className="text-left">Diagnostics</TableHead>
                    <TableHead className="text-left">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedUnlinkedAuctions.length ? (
                    pagedUnlinkedAuctions.map((auction) => {
                      const diagnostics = buildDiagnostics(auction)
                      const isSelected = selectedAiSet.has(auction.itemId)

                      return (
                        <TableRow key={auction.itemId}>
                          <TableCell className="text-left">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300"
                              checked={isSelected}
                              onChange={() => toggleAiSelection(auction.itemId)}
                              aria-label={`Select auction ${auction.itemId}`}
                            />
                          </TableCell>
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
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Item #{auction.itemId}
                              </p>
                            </div>
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
                          <TableCell className="text-left">
                            <Button variant="secondary" size="sm" onClick={() => handleOpenSearch(auction)}>
                              Search for card
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-slate-500">
                        {unlinkedLoading
                          ? 'Loading unlinked auctions…'
                          : unlinkedError
                            ? 'Unable to load unlinked auctions.'
                            : activeLinkView === 'ready'
                              ? 'No ready-to-link auctions found.'
                              : 'No unlinked auctions found.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search for card</DialogTitle>
            <DialogDescription>
              {selectedAuction
                ? `Match auction #${selectedAuction.itemId} to the correct card and save it.`
                : 'Pick a card to link.'}
            </DialogDescription>
          </DialogHeader>

          {selectedAuction ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="font-semibold text-slate-900 dark:text-slate-50">
                {selectedAuction.title ?? `Auction #${selectedAuction.itemId}`}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Detected card # {selectedAuction.detectedCollectorNumber ?? '—'} · Detected set{' '}
                {formatDetectedExpansion(selectedAuction)}
              </p>
            </div>
          ) : null}

          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="card-search">Search</Label>
              <Input
                id="card-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by card name, number, set name, or set code"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {manualLinkError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
              {manualLinkError}
            </div>
          ) : null}

          {manualLinkSuccess ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
              {manualLinkSuccess}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Results</p>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {searchQuery && cardSearchLoading ? (
                <p className="text-sm text-slate-500">Searching…</p>
              ) : cardSearchError ? (
                <p className="text-sm text-rose-400">Failed to load search results.</p>
              ) : cardSearchResults?.length ? (
                cardSearchResults.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{card.name ?? 'Unknown card'}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {card.setName ?? 'Unknown set'}
                        {card.ptSetId || card.setCode ? ` · ${card.ptSetId ?? card.setCode}` : ''} ·{' '}
                        {card.cardNumber ?? 'Unnumbered'}
                        {card.era ? ` · ${card.era}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleManualLink(card.id)}
                      disabled={manualLinkPending}
                    >
                      {manualLinkPending ? 'Linking…' : 'Link card'}
                    </Button>
                  </div>
                ))
              ) : searchQuery ? (
                <p className="text-sm text-slate-500">No cards found for that search.</p>
              ) : (
                <p className="text-sm text-slate-500">Enter a search term to find cards.</p>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-end">
            <Button variant="secondary" onClick={() => setSearchOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
