import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCcw, Rocket, Search } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchCardsForSet,
  fetchSets,
  discardAuction,
  fetchEnrichmentSummary,
  fetchUnmatchedAuctions,
  manuallyMatchAuction,
  runEnrichment,
  runUnlinkedEnrichment,
  runFullEnrichment,
  type UnmatchedAuction
} from '../lib/api'
import type { ExpansionSummary } from '../types'

const matchingSteps = [
  'Validate ERA; missing or garbage eras are marked as Mismatched.',
  'Extract the first card number pattern (NNN/TTT) from the auction title.',
  'Filter candidate sets by ERA + set_total (the denominator).',
  'Use set hints in the title (set names/aliases) to break ties between sets.',
  'Resolve the card inside the chosen set using the parsed card number.',
  'Store match status, parsed number, set total, and matched set/card identifiers with debug details.'
]

const FULL_RUN_BATCH_SIZE = 500

export function DataEnrichmentPage(): JSX.Element {
  const [runLimit, setRunLimit] = useState(300)
  const [unmatchedLimit, setUnmatchedLimit] = useState(50)
  const [unmatchedLimitInput, setUnmatchedLimitInput] = useState('50')

  const summaryQuery = useQuery({
    queryKey: ['enrichment-summary'],
    queryFn: fetchEnrichmentSummary
  })

  const unmatchedQuery = useQuery({
    queryKey: ['enrichment-unmatched', unmatchedLimit],
    queryFn: () => fetchUnmatchedAuctions(unmatchedLimit)
  })

  const mutation = useMutation({
    mutationFn: () => runEnrichment(runLimit),
    onSuccess: () => {
      summaryQuery.refetch()
      unmatchedQuery.refetch()
    }
  })

  const unlinkedMutation = useMutation({
    mutationFn: () => runUnlinkedEnrichment(runLimit),
    onSuccess: () => {
      summaryQuery.refetch()
      unmatchedQuery.refetch()
    }
  })

  const fullRunMutation = useMutation({
    mutationFn: () => runFullEnrichment(FULL_RUN_BATCH_SIZE),
    onSuccess: () => {
      summaryQuery.refetch()
      unmatchedQuery.refetch()
    }
  })

  const summaryStats = useMemo(() => {
    const summary = summaryQuery.data
    if (!summary) return []
    const pending = (summary.unprocessed ?? 0) + (summary.unmatched ?? 0) + (summary.needsReview ?? 0)
    return [
      { label: 'Linked auctions', value: summary.linkedAuctions ?? 0 },
      { label: 'Pending matching', value: pending },
      { label: 'Needs review', value: summary.needsReview ?? 0 },
      { label: 'Mismatched', value: summary.mismatched ?? 0 }
    ]
  }, [summaryQuery.data])

  const coverageStats = useMemo(() => {
    const summary = summaryQuery.data
    const total = summary?.totalAuctions ?? 0
    if (!summary || total === 0) return null
    const linked = summary.linkedAuctions ?? 0
    const pending = (summary.unprocessed ?? 0) + (summary.unmatched ?? 0) + (summary.needsReview ?? 0)
    const coveragePercent = Math.min(100, Math.round((linked / total) * 100))
    return { total, linked, pending, coveragePercent }
  }, [summaryQuery.data])

  const unmatchedAuctions = unmatchedQuery.data ?? []
  const refetchEnrichmentTables = () => {
    unmatchedQuery.refetch()
  }

  const applyUnmatchedLimit = () => {
    const parsed = Number(unmatchedLimitInput)
    const nextLimit = Math.min(500, Math.max(10, Number.isFinite(parsed) ? parsed : unmatchedLimit))
    setUnmatchedLimit(nextLimit)
    setUnmatchedLimitInput(String(nextLimit))
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-slate-500">Data Enrichment</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Auction → Card matcher</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Rebuilt to rely on ERA + set totals + set hints for deterministic matching. Oldest unseen auctions are
            processed first to work through the backlog.
          </p>
          {coverageStats ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Match coverage: {coverageStats.coveragePercent}% ({coverageStats.linked.toLocaleString()} of
              {coverageStats.total.toLocaleString()} auctions linked, {coverageStats.pending.toLocaleString()} still
              unlinked)
            </p>
          ) : null}
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex items-center gap-2"
        >
          {mutation.isPending ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {mutation.isPending ? 'Running matcher…' : 'Run matcher'}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" />
            Matching approach
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {matchingSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Summary</CardTitle>
            {summaryQuery.isFetching ? (
              <div className="text-xs text-slate-500">Refreshing…</div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            {summaryQuery.data ? (
              <div className="space-y-2">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {summaryQuery.data.totalAuctions?.toLocaleString('sv-SE') ?? '–'} auctions
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {summaryStats.map((item) => (
                    <div key={item.label} className="rounded border border-slate-200 p-2 dark:border-slate-800">
                      <p className="text-xs uppercase text-slate-500">{item.label}</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{item.value}</p>
                    </div>
                  ))}
                </div>
                {coverageStats ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Overall coverage: {coverageStats.coveragePercent}% linked
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-slate-500">No summary available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run matcher</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <p>
              The matcher processes the next batch of untouched auctions (oldest first) and records match status, set
              totals, and debug metadata for every row.
            </p>
            <p className="text-xs text-slate-500">
              Use the full re-run to process all auctions in manageable batches (currently
              {` ${FULL_RUN_BATCH_SIZE.toLocaleString()} `}at a time) without overloading the matcher.
            </p>
            <label className="text-xs uppercase text-slate-500">Batch size</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1000}
                value={runLimit}
                onChange={(e) => setRunLimit(Number(e.target.value) || 0)}
                className="max-w-[120px]"
              />
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? 'Running…' : 'Run'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => unlinkedMutation.mutate()}
                disabled={unlinkedMutation.isPending}
              >
                {unlinkedMutation.isPending ? 'Retrying…' : 'Retry unlinked auctions'}
              </Button>
              <p className="text-xs text-slate-500">
                Re-run the matcher for everything without a linked card (including previous attempts) without resetting
                manual discards.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => fullRunMutation.mutate()}
                disabled={fullRunMutation.isPending}
              >
                {fullRunMutation.isPending ? 'Re-running all…' : 'Re-run all auctions'}
              </Button>
              {fullRunMutation.isPending ? (
                <span className="text-xs text-slate-500">
                  Working through every auction in {FULL_RUN_BATCH_SIZE.toLocaleString()}-item batches…
                </span>
              ) : null}
            </div>
            {fullRunMutation.isSuccess ? (
              <p className="text-xs text-green-600">
                Full re-run finished: processed {fullRunMutation.data.totalAttempted.toLocaleString()} auctions.
                {fullRunMutation.data.durationMs ? ` (${Math.round(fullRunMutation.data.durationMs / 1000)}s)` : ''}
                {fullRunMutation.data.timedOut
                  ? '; paused early to stay within the request timeout—run again to keep going.'
                  : ''}
              </p>
            ) : null}
            {fullRunMutation.isError ? (
              <p className="text-xs text-red-600">{(fullRunMutation.error as Error).message}</p>
            ) : null}
            {[mutation.data, unlinkedMutation.data]
              .filter(Boolean)
              .map((result) => (
                <div
                  key={`${result?.target}-${result?.remainingAfter}-${result?.attempted}`}
                  className="rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                    <AlertCircle className="h-4 w-4" /> Matcher result ({result?.target})
                  </div>
                  <p className="mt-1">
                    Processed {result?.attempted.toLocaleString()} auctions; linked {result?.linked.toLocaleString()} cards.
                  </p>
                  {result?.remainingBefore !== null && result?.remainingAfter !== null ? (
                    <p className="mt-1">
                      Remaining in queue: {result.remainingAfter} (previously {result.remainingBefore}).
                    </p>
                  ) : null}
                  {Object.keys(result?.statusCounts || {}).length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {Object.entries(result?.statusCounts ?? {}).map(([status, count]) => (
                        <li key={status}>
                          <span className="font-semibold">{status}:</span> {count}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            {fullRunMutation.data ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" /> Full re-run completed
                </div>
                <p className="mt-1">Processed {fullRunMutation.data.totalAttempted.toLocaleString()} auctions across {fullRunMutation.data.batches} batches of {fullRunMutation.data.batchSize}.</p>
              <p className="mt-1">Linked {fullRunMutation.data.totalLinked.toLocaleString()} auctions. Remaining: {fullRunMutation.data.remainingAfter ?? '–'} (previously {fullRunMutation.data.remainingBefore ?? '–'}).</p>
                {typeof fullRunMutation.data.resetStatusesCount === 'number' && fullRunMutation.data.resetStatusesCount > 0 ? (
                  <p className="mt-1">Reset {fullRunMutation.data.resetStatusesCount.toLocaleString()} previously reviewed auctions before reprocessing.</p>
                ) : null}
                {fullRunMutation.data.durationMs ? (
                  <p className="mt-1">Runtime: {Math.round(fullRunMutation.data.durationMs / 1000)}s.</p>
                ) : null}
                {fullRunMutation.data.timedOut ? (
                  <p className="mt-1">Stopped early to avoid request timeouts—run again to continue the backlog.</p>
                ) : null}
                {Object.keys(fullRunMutation.data.statusCounts || {}).length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {Object.entries(fullRunMutation.data.statusCounts).map(([status, count]) => (
                      <li key={status}>
                        <span className="font-semibold">{status}:</span> {count}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items needing review</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              Showing {unmatchedAuctions.length.toLocaleString('sv-SE')} of{' '}
              {summaryQuery.data?.needsReview?.toLocaleString('sv-SE') ?? '–'} items needing review
            </span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-wide">Rows to load</label>
              <Input
                className="h-8 max-w-[96px]"
                type="number"
                min={10}
                max={500}
                value={unmatchedLimitInput}
                onChange={(e) => setUnmatchedLimitInput(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={applyUnmatchedLimit} disabled={unmatchedQuery.isFetching}>
                {unmatchedQuery.isFetching ? 'Updating…' : `Load ${Number(unmatchedLimitInput) || unmatchedLimit}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => unmatchedQuery.refetch()} disabled={unmatchedQuery.isFetching}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Auctions needing attention</p>
                <p className="text-xs text-slate-500">
                  Includes rows marked "Needs review" or "Mismatched" along with any unresolved auctions without a
                  set hint. Parsed numbers still surface the easiest wins first.
                </p>
              </div>
              {unmatchedQuery.isFetching ? <span className="text-xs text-slate-500">Refreshing…</span> : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Parsed number</TableHead>
                  <TableHead>Set total</TableHead>
                  <TableHead>Set hint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Manual actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedAuctions.map((row) => (
                  <TableRow key={row.item_id}>
                    <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{row.title}</TableCell>
                    <TableCell>{row.parsed_card_number ?? '—'}</TableCell>
                    <TableCell>{row.parsed_set_total ?? '—'}</TableCell>
                    <TableCell>{row.matched_set_code ?? '—'}</TableCell>
                    <TableCell>{row.match_status ?? '—'}</TableCell>
                    <TableCell>
                      <ManualMatchCell auction={row} onUpdated={refetchEnrichmentTables} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {unmatchedAuctions.length === 0 ? (
              <p className="text-sm text-slate-500">No auctions needing manual review right now.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type ManualMatchCellProps = {
  auction: UnmatchedAuction
  onUpdated: () => void
}

function ManualMatchCell({ auction, onUpdated }: ManualMatchCellProps) {
  const [search, setSearch] = useState('')
  const [selectedCardId, setSelectedCardId] = useState<number | ''>('')
  const [activeSetCode, setActiveSetCode] = useState(auction.matched_set_code ?? '')

  const normalizedSetCode = activeSetCode.trim().toUpperCase()

  const setsQuery = useQuery({
    queryKey: ['sets'],
    queryFn: fetchSets
  })

  const cardsQuery = useQuery({
    queryKey: ['cards-for-set', normalizedSetCode],
    queryFn: () => fetchCardsForSet(normalizedSetCode),
    enabled: Boolean(normalizedSetCode)
  })

  const manualMatchMutation = useMutation({
    mutationFn: (cardId: number) => manuallyMatchAuction(auction.item_id, cardId, normalizedSetCode),
    onSuccess: () => {
      setSelectedCardId('')
      onUpdated()
    }
  })

  const discardMutation = useMutation({
    mutationFn: () => discardAuction(auction.item_id),
    onSuccess: () => {
      setSelectedCardId('')
      onUpdated()
    }
  })

  const normalizeCardNumber = (value: string | null | undefined) => {
    if (!value) return null
    const match = String(value).match(/^(\d+)/)
    return match ? Number(match[1]) : null
  }

  const cardsMatchingParsedNumber = useMemo(() => {
    if (auction.parsed_card_number === null) return []
    const target = auction.parsed_card_number
    return (cardsQuery.data || []).filter((card) => normalizeCardNumber(card.card_number) === target)
  }, [auction.parsed_card_number, cardsQuery.data])

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase()
    const cards = cardsQuery.data || []
    if (!query) return cards
    return cards.filter((card) => {
      const name = card.name?.toLowerCase() || ''
      const number = card.card_number?.toLowerCase() || ''
      return name.includes(query) || number.includes(query)
    })
  }, [cardsQuery.data, search])

  const cardsForSelect = useMemo(() => {
    if (auction.parsed_card_number !== null && search.trim() === '') {
      if (cardsMatchingParsedNumber.length > 0) return cardsMatchingParsedNumber
    }
    return filteredCards
  }, [auction.parsed_card_number, cardsMatchingParsedNumber, filteredCards, search])

  const canMatch = Boolean(normalizedSetCode)

  const handleSetChange = (value: string) => {
    setActiveSetCode(value)
    setSelectedCardId('')
    setSearch('')
  }

  const displaySet: ExpansionSummary | null = useMemo(() => {
    if (!normalizedSetCode) return null
    return (setsQuery.data || []).find(
      (set) => set.set_code?.toUpperCase() === normalizedSetCode || set.name?.toUpperCase() === normalizedSetCode
    ) ?? null
  }, [normalizedSetCode, setsQuery.data])

  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Select
            value={activeSetCode}
            disabled={setsQuery.isFetching}
            onChange={(e) => handleSetChange(e.target.value)}
          >
            <option value="">{setsQuery.isFetching ? 'Loading sets…' : 'Select a set'}</option>
            {(setsQuery.data || []).map((set) => (
              <option key={set.set_code ?? set.name ?? set.id} value={set.set_code ?? ''}>
                {set.name ?? set.set_code}
                {set.era ? ` — ${set.era}` : ''}
                {set.set_code ? ` (${set.set_code})` : ''}
              </option>
            ))}
          </Select>
          {auction.matched_set_code ? (
            <span className="text-[11px] text-slate-500">Hinted: {auction.matched_set_code}</span>
          ) : null}
        </div>
        {displaySet ? (
          <p className="text-[11px] text-slate-500">
            {displaySet.name || displaySet.set_code} {displaySet.era ? `• ${displaySet.era}` : ''}
            {displaySet.set_total ? ` • ${displaySet.set_total} cards` : ''}
            {!displaySet.set_total && typeof displaySet.cards_total === 'number'
              ? ` • ${displaySet.cards_total} cards`
              : ''}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">Select a set to load its cards for manual matching.</p>
        )}
        {canMatch ? (
          <div className="space-y-1">
            {auction.parsed_card_number !== null ? (
              <p className="text-[11px] text-slate-500">
                Showing cards numbered {auction.parsed_card_number}
                {cardsMatchingParsedNumber.length === 0 ? ' (none found; search to pick manually)' : ''}.
              </p>
            ) : null}
            <Input
              className="h-8"
              placeholder={
                auction.parsed_card_number !== null
                  ? 'Optional search (fallback)'
                  : 'Search card name/#'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Select
                value={selectedCardId === '' ? '' : String(selectedCardId)}
                disabled={cardsQuery.isFetching || !canMatch}
                onChange={(e) => setSelectedCardId(Number(e.target.value) || '')}
              >
                <option value="">{cardsQuery.isFetching ? 'Loading cards…' : 'Select a card'}</option>
                {cardsForSelect.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.card_number ? `${card.card_number} — ` : ''}
                    {card.name || 'Unnamed card'}
                  </option>
                ))}
                {!cardsQuery.isFetching && cardsForSelect.length === 0 ? (
                  <option disabled value="">
                    {auction.parsed_card_number !== null && search.trim() === ''
                      ? `No cards numbered ${auction.parsed_card_number}`
                      : `No matches for “${search}”`}
                  </option>
                ) : null}
              </Select>
              <Button
                size="sm"
                disabled={!selectedCardId || manualMatchMutation.isPending}
                onClick={() => typeof selectedCardId === 'number' && manualMatchMutation.mutate(selectedCardId)}
              >
                {manualMatchMutation.isPending ? 'Linking…' : 'Link'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Choose a set to load and link one of its cards.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={discardMutation.isPending}
          onClick={() => discardMutation.mutate()}
        >
          {discardMutation.isPending ? 'Discarding…' : 'Discard'}
        </Button>
        {manualMatchMutation.isSuccess ? (
          <span className="text-[11px] text-green-600">Linked!</span>
        ) : null}
        {discardMutation.isSuccess ? <span className="text-[11px] text-green-600">Discarded.</span> : null}
      </div>
      {manualMatchMutation.isError ? (
        <p className="text-[11px] text-red-500">{(manualMatchMutation.error as Error).message}</p>
      ) : null}
      {cardsQuery.isError ? (
        <p className="text-[11px] text-red-500">Failed to load cards for set {normalizedSetCode || '—'}.</p>
      ) : null}
      {discardMutation.isError ? (
        <p className="text-[11px] text-red-500">{(discardMutation.error as Error).message}</p>
      ) : null}
    </div>
  )
}
