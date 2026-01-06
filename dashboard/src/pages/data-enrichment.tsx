import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCcw, Rocket } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchPendingAuctions,
  fetchLinkedAuctions,
  fetchUnmatchedAuctions,
  manuallyMatchAuction,
  runEnrichment,
  runUnlinkedEnrichment,
  runFullEnrichment,
  type PendingAuction,
  type LinkedAuction,
  type UnmatchedAuction
} from '../lib/api'

const FULL_RUN_BATCH_SIZE = 500
const FULL_RUN_MAX_RUNTIME_MS = 55_000

export function DataEnrichmentPage(): JSX.Element {
  const [runLimit, setRunLimit] = useState(300)

  const [unmatchedLimit, setUnmatchedLimit] = useState(50)
  const [unmatchedLimitInput, setUnmatchedLimitInput] = useState('50')

  const [pendingLimit, setPendingLimit] = useState(50)
  const [pendingLimitInput, setPendingLimitInput] = useState('50')

  const [linkedLimit, setLinkedLimit] = useState(50)
  const [linkedLimitInput, setLinkedLimitInput] = useState('50')

  const unmatchedQuery = useQuery({
    queryKey: ['enrichment-unmatched', unmatchedLimit],
    queryFn: () => fetchUnmatchedAuctions(unmatchedLimit)
  })

  const pendingQuery = useQuery({
    queryKey: ['enrichment-pending', pendingLimit],
    queryFn: () => fetchPendingAuctions(pendingLimit)
  })

  const linkedQuery = useQuery({
    queryKey: ['enrichment-linked', linkedLimit],
    queryFn: () => fetchLinkedAuctions(linkedLimit)
  })

  const refetchEnrichmentTables = () => {
    unmatchedQuery.refetch()
    pendingQuery.refetch()
    linkedQuery.refetch()
  }

  const mutation = useMutation({
    mutationFn: () => runEnrichment(runLimit),
    onSuccess: () => {
      refetchEnrichmentTables()
    }
  })

  const unlinkedMutation = useMutation({
    mutationFn: () => runUnlinkedEnrichment(runLimit),
    onSuccess: () => {
      refetchEnrichmentTables()
    }
  })

  const fullRunMutation = useMutation({
    mutationFn: () =>
      runFullEnrichment({
        batchSize: FULL_RUN_BATCH_SIZE,
        maxRuntimeMs: FULL_RUN_MAX_RUNTIME_MS,
        resetExisting: false
      }),
    onSuccess: () => {
      refetchEnrichmentTables()
    }
  })

  const manualMatchMutation = useMutation({
    mutationFn: (payload: { itemId: string | number; cardId: number }) =>
      manuallyMatchAuction(payload.itemId, payload.cardId),
    onSuccess: () => {
      refetchEnrichmentTables()
    }
  })

  const unmatchedAuctions = unmatchedQuery.data ?? []
  const pendingAuctions = pendingQuery.data ?? []
  const linkedAuctions = linkedQuery.data ?? []

  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString('sv-SE') : '—'

  const formatNumber = (value?: number | null) =>
    typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('sv-SE') : '—'

  const formatText = (value?: string | null) => value?.trim() || '—'

  const formatMatchedSet = (row: { matched_set_code?: string | null; card_set_code?: string | null }) =>
    formatText(row.matched_set_code || row.card_set_code)

  const safeNumber = (value?: number | null) => (typeof value === 'number' ? value : 0)

  const applyUnmatchedLimit = () => {
    const parsed = Number(unmatchedLimitInput)
    const nextLimit = Math.min(500, Math.max(10, Number.isFinite(parsed) ? parsed : unmatchedLimit))
    setUnmatchedLimit(nextLimit)
    setUnmatchedLimitInput(String(nextLimit))
  }

  const applyPendingLimit = () => {
    const parsed = Number(pendingLimitInput)
    const nextLimit = Math.min(500, Math.max(10, Number.isFinite(parsed) ? parsed : pendingLimit))
    setPendingLimit(nextLimit)
    setPendingLimitInput(String(nextLimit))
  }

  const applyLinkedLimit = () => {
    const parsed = Number(linkedLimitInput)
    const nextLimit = Math.min(500, Math.max(10, Number.isFinite(parsed) ? parsed : linkedLimit))
    setLinkedLimit(nextLimit)
    setLinkedLimitInput(String(nextLimit))
  }

  function ReasonBadge({ label, value }: { label: string; value: number }) {
    const displayValue = safeNumber(value)

    return (
      <div className="rounded border border-slate-200 p-3 text-center dark:border-slate-800">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{displayValue.toLocaleString('sv-SE')}</p>
      </div>
    )
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

        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex items-center gap-2">
          {mutation.isPending ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {mutation.isPending ? 'Running matcher…' : 'Run matcher'}
        </Button>
      </header>

      {/* Unmatched */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Unmatched auctions</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Auctions the matcher could not safely link. Use this to spot patterns and manually resolve edge cases.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Showing {unmatchedAuctions.length.toLocaleString('sv-SE')} unmatched auctions</span>
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unmatchedQuery.refetch()}
                disabled={unmatchedQuery.isFetching}
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Auction</TableHead>
                  <TableHead>Parsed hints</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Manual match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedAuctions.map((row: UnmatchedAuction) => (
                  <TableRow key={row.item_id}>
                    <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
                    <TableCell className="min-w-[280px] space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.title || '—'}</p>
                      <p className="text-[11px] text-slate-500">Ends: {formatDateTime(row.end_date)}</p>
                      <p className="text-[11px] text-slate-500">
                        URL:{' '}
                        {row.item_url ? (
                          <a className="text-blue-600 underline" href={row.item_url} target="_blank" rel="noreferrer">
                            Open auction
                          </a>
                        ) : (
                          '—'
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[220px] space-y-1 text-[11px]">
                      <p>Parsed #: {row.parsed_card_no ?? row.parsed_card_number ?? '—'}</p>
                      <p>Raw number: {formatText(row.parsed_number_text)}</p>
                      <p>Set total: {row.parsed_set_total ?? '—'}</p>
                      <p>Matched set: {formatMatchedSet(row)}</p>
                      <p>Matched era: {formatText(row.matched_era)}</p>
                    </TableCell>
                    <TableCell className="min-w-[220px] space-y-1 text-[11px]">
                      <p>Status: {formatText(row.status)}</p>
                      <p>Method: {formatText(row.method)}</p>
                      <p>Reason: {formatText(row.match_reason)}</p>
                    </TableCell>
                    <TableCell className="min-w-[220px] space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8"
                          placeholder="Card ID…"
                          type="number"
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            const val = Number((e.currentTarget as HTMLInputElement).value)
                            if (!Number.isFinite(val) || val <= 0) return
                            manualMatchMutation.mutate({ itemId: row.item_id, cardId: val })
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={manualMatchMutation.isPending}
                          onClick={(e) => {
                            const container = (e.currentTarget.parentElement as HTMLElement) || null
                            const input = container?.querySelector('input') as HTMLInputElement | null
                            const val = Number(input?.value)
                            if (!Number.isFinite(val) || val <= 0) return
                            manualMatchMutation.mutate({ itemId: row.item_id, cardId: val })
                          }}
                        >
                          Link
                        </Button>
                      </div>
                      {manualMatchMutation.isError ? (
                        <p className="text-[11px] text-red-600">{(manualMatchMutation.error as Error).message}</p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {unmatchedAuctions.length === 0 ? (
            <p className="text-xs text-slate-500">No unmatched auctions found.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Pending */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Auctions waiting for enrichment</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Raw rows that have not been processed by the matcher yet. Oldest auctions are shown first.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Showing {pendingAuctions.length.toLocaleString('sv-SE')} pending auctions</span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-wide">Rows to load</label>
              <Input
                className="h-8 max-w-[96px]"
                type="number"
                min={10}
                max={500}
                value={pendingLimitInput}
                onChange={(e) => setPendingLimitInput(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={applyPendingLimit} disabled={pendingQuery.isFetching}>
                {pendingQuery.isFetching ? 'Updating…' : `Load ${Number(pendingLimitInput) || pendingLimit}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => pendingQuery.refetch()} disabled={pendingQuery.isFetching}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-xs text-slate-500">
            Use this table to validate that the backlog contains the fields we expect (seller, category, parsed hints)
            before the enrichment job runs.
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Auction</TableHead>
                  <TableHead>Price & bids</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Parsed hints</TableHead>
                  <TableHead>Matcher metadata</TableHead>
                  <TableHead>Timing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingAuctions.map((row: PendingAuction) => (
                  <TableRow key={row.item_id}>
                    <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
                    <TableCell className="min-w-[260px] space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.title || '—'}</p>
                      <p className="text-[11px] text-slate-500">Category: {row.category_id ?? '—'}</p>
                      <p className="text-[11px] text-slate-500">Ends: {formatDateTime(row.end_date)}</p>
                      <p className="text-[11px] text-slate-500">
                        URL:{' '}
                        {row.item_url ? (
                          <a className="text-blue-600 underline" href={row.item_url} target="_blank" rel="noreferrer">
                            Open auction
                          </a>
                        ) : (
                          '—'
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[160px] space-y-1 text-xs">
                      <p>Price: {formatNumber(row.price)}</p>
                      <p>Bids: {formatNumber(row.bid_count)}</p>
                    </TableCell>
                    <TableCell className="min-w-[180px] space-y-1 text-xs">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{formatText(row.seller_alias)}</p>
                      <p className="text-[11px] text-slate-500">Seller ID: {row.seller_id ?? '—'}</p>
                      <p className="text-[11px] text-slate-500">DSR: {row.seller_dsr ?? '—'}</p>
                    </TableCell>
                    <TableCell className="min-w-[200px] space-y-1 text-[11px]">
                      <p>Parsed #: {row.parsed_card_no ?? row.parsed_card_number ?? '—'}</p>
                      <p>Raw number: {formatText(row.parsed_number_text)}</p>
                      <p>Set total: {row.parsed_set_total ?? '—'}</p>
                      <p>Matched set: {formatMatchedSet(row)}</p>
                    </TableCell>
                    <TableCell className="min-w-[220px] space-y-1 text-[11px]">
                      <p>Status: {formatText(row.status)}</p>
                      <p>Method: {formatText(row.method)}</p>
                      <p>
                        Confidence: {formatText(row.confidence)}
                        {row.confidence_score ? ` (${row.confidence_score})` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[200px] space-y-1 text-[11px]">
                      <p>Processing started: {formatDateTime(row.processing_started_at)}</p>
                      <p>Updated: {formatDateTime(row.updated_at)}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pendingAuctions.length === 0 ? (
            <p className="text-xs text-slate-500">No pending auctions found in the queue.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Linked */}
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Processed + linked auctions</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Recent auctions that the enrichment pipeline linked to a card, with all available context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Showing {linkedAuctions.length.toLocaleString('sv-SE')} linked auctions</span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] uppercase tracking-wide">Rows to load</label>
              <Input
                className="h-8 max-w-[96px]"
                type="number"
                min={10}
                max={500}
                value={linkedLimitInput}
                onChange={(e) => setLinkedLimitInput(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={applyLinkedLimit} disabled={linkedQuery.isFetching}>
                {linkedQuery.isFetching ? 'Updating…' : `Load ${Number(linkedLimitInput) || linkedLimit}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => linkedQuery.refetch()} disabled={linkedQuery.isFetching}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-xs text-slate-500">
            Inspect matcher metadata alongside the linked card to verify that the enrichment rules line up with the stored
            card information.
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Auction</TableHead>
                  <TableHead>Price & seller</TableHead>
                  <TableHead>Parsed hints</TableHead>
                  <TableHead>Matcher metadata</TableHead>
                  <TableHead>Linked card</TableHead>
                  <TableHead>Timing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedAuctions.map((row: LinkedAuction) => (
                  <TableRow key={row.item_id}>
                    <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
                    <TableCell className="min-w-[240px] space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.title || '—'}</p>
                      <p className="text-[11px] text-slate-500">Category: {row.category_id ?? '—'}</p>
                      <p className="text-[11px] text-slate-500">Ends: {formatDateTime(row.end_date)}</p>
                      <p className="text-[11px] text-slate-500">
                        URL:{' '}
                        {row.item_url ? (
                          <a className="text-blue-600 underline" href={row.item_url} target="_blank" rel="noreferrer">
                            Open auction
                          </a>
                        ) : (
                          '—'
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[180px] space-y-1 text-xs">
                      <p>Price: {formatNumber(row.price)}</p>
                      <p>Bids: {formatNumber(row.bid_count)}</p>
                      <p>Seller: {formatText(row.seller_alias)}</p>
                      <p className="text-[11px] text-slate-500">Seller ID: {row.seller_id ?? '—'}</p>
                      <p className="text-[11px] text-slate-500">DSR: {row.seller_dsr ?? '—'}</p>
                    </TableCell>
                    <TableCell className="min-w-[200px] space-y-1 text-[11px]">
                      <p>Parsed #: {row.parsed_card_no ?? row.parsed_card_number ?? '—'}</p>
                      <p>Raw number: {formatText(row.parsed_number_text)}</p>
                      <p>Set total: {row.parsed_set_total ?? '—'}</p>
                      <p>Matched set: {formatMatchedSet(row)}</p>
                      <p>Matched era: {formatText(row.matched_era)}</p>
                    </TableCell>
                    <TableCell className="min-w-[220px] space-y-1 text-[11px]">
                      <p>Status: {formatText(row.status)}</p>
                      <p>Method: {formatText(row.method)}</p>
                      <p>
                        Confidence: {formatText(row.confidence)}
                        {row.confidence_score ? ` (${row.confidence_score})` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[220px] space-y-1 text-[11px]">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatText(row.card_name)}</p>
                      <p>Card #: {formatText(row.card_number)}</p>
                      <p>Linked card ID: {row.card_id ?? '—'}</p>
                    </TableCell>
                    <TableCell className="min-w-[200px] space-y-1 text-[11px]">
                      <p>Processing started: {formatDateTime(row.processing_started_at)}</p>
                      <p>Updated: {formatDateTime(row.updated_at)}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {linkedAuctions.length === 0 ? (
            <p className="text-xs text-slate-500">No processed + linked auctions available yet.</p>
          ) : null}
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
            Use the full re-run to sweep every unlinked auction in batches (currently{' '}
            {FULL_RUN_BATCH_SIZE.toLocaleString()} at a time) until the queue is empty or the{' '}
            {(FULL_RUN_MAX_RUNTIME_MS / 1000).toLocaleString()}s time budget is reached.
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
            <Button variant="outline" onClick={() => unlinkedMutation.mutate()} disabled={unlinkedMutation.isPending}>
              {unlinkedMutation.isPending ? 'Retrying…' : 'Retry unlinked auctions'}
            </Button>
            <p className="text-xs text-slate-500">
              Re-run the matcher for everything without a linked card (including previous attempts) without resetting
              manual discards.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => fullRunMutation.mutate()} disabled={fullRunMutation.isPending}>
              {fullRunMutation.isPending ? 'Sweeping unlinked…' : 'Sweep all unlinked auctions'}
            </Button>
            {fullRunMutation.isPending ? (
              <span className="text-xs text-slate-500">
                Working through every unlinked auction in {FULL_RUN_BATCH_SIZE.toLocaleString()}-item batches…
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
                        <span className="font-semibold">{status}:</span> {count as any}
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
              <p className="mt-1">
                Processed {fullRunMutation.data.totalAttempted.toLocaleString()} auctions across{' '}
                {fullRunMutation.data.batches} batches of {fullRunMutation.data.batchSize}.
              </p>
              <p className="mt-1">
                Linked {fullRunMutation.data.totalLinked.toLocaleString()} auctions. Remaining:{' '}
                {fullRunMutation.data.remainingAfter ?? '–'} (previously {fullRunMutation.data.remainingBefore ?? '–'}).
              </p>
              {typeof fullRunMutation.data.resetStatusesCount === 'number' &&
              fullRunMutation.data.resetStatusesCount > 0 ? (
                <p className="mt-1">
                  Reset {fullRunMutation.data.resetStatusesCount.toLocaleString()} previously reviewed auctions before
                  reprocessing.
                </p>
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
                      <span className="font-semibold">{status}:</span> {count as any}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
