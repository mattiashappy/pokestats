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
  fetchEnrichmentSummary,
  fetchUnmatchedAuctions,
  manuallyMatchAuction,
  runEnrichment,
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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-slate-500">Data Enrichment</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Auction → Card matcher</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Rebuilt to rely on ERA + set totals + set hints for deterministic matching.
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
              The matcher processes recent auctions and records match status, set totals, and debug metadata for every row.
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
            {mutation.data ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                  <AlertCircle className="h-4 w-4" /> Matcher result
                </div>
                <p className="mt-1">Processed {mutation.data.attempted} auctions; linked {mutation.data.linked} cards.</p>
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items needing review</CardTitle>
          {unmatchedQuery.isFetching ? <span className="text-xs text-slate-500">Loading…</span> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Parsed number</TableHead>
                <TableHead>Set total</TableHead>
                <TableHead>Set hint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Manual match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(unmatchedQuery.data ?? []).map((row) => (
                <TableRow key={row.item_id}>
                  <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{row.title}</TableCell>
                  <TableCell>{row.parsed_card_number ?? '—'}</TableCell>
                  <TableCell>{row.parsed_set_total ?? '—'}</TableCell>
                  <TableCell>{row.matched_set_code ?? '—'}</TableCell>
                  <TableCell>{row.match_status ?? '—'}</TableCell>
                  <TableCell>
                    <ManualMatchCell auction={row} onMatched={() => unmatchedQuery.refetch()} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {unmatchedQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-500">No unmatched auctions at the moment.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

type ManualMatchCellProps = {
  auction: UnmatchedAuction
  onMatched: () => void
}

function ManualMatchCell({ auction, onMatched }: ManualMatchCellProps) {
  const [search, setSearch] = useState('')
  const [selectedCardId, setSelectedCardId] = useState<number | ''>('')

  const cardsQuery = useQuery({
    queryKey: ['cards-for-set', auction.matched_set_code],
    queryFn: () => fetchCardsForSet(auction.matched_set_code || ''),
    enabled: Boolean(auction.matched_set_code)
  })

  const mutation = useMutation({
    mutationFn: (cardId: number) => manuallyMatchAuction(auction.item_id, cardId),
    onSuccess: () => {
      setSelectedCardId('')
      onMatched()
    }
  })

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

  if (!auction.matched_set_code) {
    return <p className="text-xs text-slate-500">No set hint available.</p>
  }

  return (
    <div className="space-y-2 text-xs">
      <Input
        className="h-8"
        placeholder="Search card name/#"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Select
          value={selectedCardId === '' ? '' : String(selectedCardId)}
          disabled={cardsQuery.isFetching || (cardsQuery.data?.length || 0) === 0}
          onChange={(e) => setSelectedCardId(Number(e.target.value) || '')}
        >
          <option value="">{cardsQuery.isFetching ? 'Loading cards…' : 'Select a card'}</option>
          {filteredCards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.card_number ? `${card.card_number} — ` : ''}
              {card.name || 'Unnamed card'}
            </option>
          ))}
          {!cardsQuery.isFetching && filteredCards.length === 0 ? (
            <option disabled value="">
              No matches for “{search}”
            </option>
          ) : null}
        </Select>
        <Button
          size="sm"
          disabled={!selectedCardId || mutation.isPending}
          onClick={() => typeof selectedCardId === 'number' && mutation.mutate(selectedCardId)}
        >
          {mutation.isPending ? 'Linking…' : 'Link'}
        </Button>
      </div>
      {mutation.isError ? (
        <p className="text-[11px] text-red-500">{(mutation.error as Error).message}</p>
      ) : null}
      {mutation.isSuccess ? <p className="text-[11px] text-green-600">Linked!</p> : null}
    </div>
  )
}
