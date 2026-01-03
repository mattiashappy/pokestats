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
  discardAuction,
  fetchEnrichmentSummary,
  fetchUnmatchedAuctions,
  manuallyMatchAuction,
  runEnrichment,
  runFullEnrichment,
  type UnmatchedAuction
} from '../lib/api'

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

  const summaryQuery = useQuery({
    queryKey: ['enrichment-summary'],
    queryFn: fetchEnrichmentSummary
  })

  const unmatchedQuery = useQuery({
    queryKey: ['enrichment-unmatched'],
    queryFn: () => fetchUnmatchedAuctions(25)
  })

  const mutation = useMutation({
    mutationFn: () => runEnrichment(runLimit),
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

  const statusBreakdown = useMemo(() => {
    const summary = summaryQuery.data
    if (!summary) return []
    return [
      { label: 'Matched', value: summary.matched ?? 0 },
      { label: 'Needs review', value: summary.needsReview ?? 0 },
      { label: 'Mismatched', value: summary.mismatched ?? 0 },
      { label: 'Linked auctions', value: summary.linkedAuctions ?? 0 }
    ]
  }, [summaryQuery.data])

  const unmatchedAuctions = unmatchedQuery.data ?? []
  const readyForManualMatch = useMemo(
    () =>
      unmatchedAuctions.filter(
        (auction) =>
          Boolean(auction.matched_set_code) && (auction.parsed_card_number !== null || auction.parsed_set_total !== null)
      ),
    [unmatchedAuctions]
  )
  const needsMoreInfo = useMemo(
    () => unmatchedAuctions.filter((auction) => !readyForManualMatch.includes(auction)),
    [readyForManualMatch, unmatchedAuctions]
  )

  const refetchEnrichmentTables = () => {
    unmatchedQuery.refetch()
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
                  {statusBreakdown.map((item) => (
                    <div key={item.label} className="rounded border border-slate-200 p-2 dark:border-slate-800">
                      <p className="text-xs uppercase text-slate-500">{item.label}</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{item.value}</p>
                    </div>
                  ))}
                </div>
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
              Use the full re-run to process all auctions in manageable batches (currently {FULL_RUN_BATCH_SIZE.toLocaleString()} at a time) without
              overloading the matcher.
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
            {mutation.data ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                  <AlertCircle className="h-4 w-4" /> Matcher result
                </div>
                <p className="mt-1">
                  Processed {mutation.data.attempted} auctions; linked {mutation.data.linked} cards.
                </p>
                {mutation.data.remainingBefore !== null && mutation.data.remainingAfter !== null ? (
                  <p className="mt-1">
                    Remaining in queue: {mutation.data.remainingAfter} (previously {mutation.data.remainingBefore}).
                  </p>
                ) : null}
                {Object.keys(mutation.data.statusCounts || {}).length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {Object.entries(mutation.data.statusCounts).map(([status, count]) => (
                      <li key={status}>
                        <span className="font-semibold">{status}:</span> {count}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {fullRunMutation.data ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4" /> Full re-run completed
                </div>
                <p className="mt-1">Processed {fullRunMutation.data.totalAttempted.toLocaleString()} auctions across {fullRunMutation.data.batches} batches of {fullRunMutation.data.batchSize}.</p>
                <p className="mt-1">Linked {fullRunMutation.data.totalLinked.toLocaleString()} auctions. Remaining: {fullRunMutation.data.remainingAfter ?? '–'} (previously {fullRunMutation.data.remainingBefore ?? '–'}).</p>
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
          {unmatchedQuery.isFetching ? <span className="text-xs text-slate-500">Loading…</span> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ready for manual match</p>
                <p className="text-xs text-slate-500">Prioritized rows with parsed set hints and card numbers.</p>
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
                {readyForManualMatch.map((row) => (
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
            {readyForManualMatch.length === 0 ? (
              <p className="text-sm text-slate-500">No auctions with enough detail to match right now.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Need more info / discard</p>
                <p className="text-xs text-slate-500">Items without reliable set hints can be discarded when unmatchable.</p>
              </div>
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
                {needsMoreInfo.map((row) => (
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
            {needsMoreInfo.length === 0 ? (
              <p className="text-sm text-slate-500">No remaining items awaiting review.</p>
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

  const cardsQuery = useQuery({
    queryKey: ['cards-for-set', auction.matched_set_code],
    queryFn: () => fetchCardsForSet(auction.matched_set_code || ''),
    enabled: Boolean(auction.matched_set_code)
  })

  const manualMatchMutation = useMutation({
    mutationFn: (cardId: number) => manuallyMatchAuction(auction.item_id, cardId),
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

  const canMatch = Boolean(auction.matched_set_code)

  return (
    <div className="space-y-2 text-xs">
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
              disabled={cardsQuery.isFetching}
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
        <p className="text-[11px] text-slate-500">No set hint available yet.</p>
      )}
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
        <p className="text-[11px] text-red-500">Failed to load cards for set {auction.matched_set_code}.</p>
      ) : null}
      {discardMutation.isError ? (
        <p className="text-[11px] text-red-500">{(discardMutation.error as Error).message}</p>
      ) : null}
    </div>
  )
}
