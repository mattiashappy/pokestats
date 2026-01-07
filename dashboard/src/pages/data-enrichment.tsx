import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCcw, Rocket, TestTube } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchEnrichmentAudit,
  fetchEnrichmentQueue,
  fetchEnrichmentStats,
  runEnrichmentForItem,
  updateEnrichmentItem,
  runFullPipeline,
  type EnrichmentQueueRow,
  type EnrichmentStats
} from '../lib/api'

const STAGE_FILTERS = [
  { label: 'Needs ERA', value: 'era' },
  { label: 'Needs SET', value: 'set' },
  { label: 'Needs NUMBER', value: 'number' },
  { label: 'Needs NAME', value: 'name' },
  { label: 'Ready to link', value: 'ready_to_link' },
  { label: 'Linked (read-only)', value: 'link' }
] as const

type StageKey = (typeof STAGE_FILTERS)[number]['value']

export function DataEnrichmentPage(): JSX.Element {
  const [stage, setStage] = useState<StageKey>('era')
  const [limit, setLimit] = useState(50)
  const [limitInput, setLimitInput] = useState('50')
  const [activeItemId, setActiveItemId] = useState<number | null>(null)
  const [savingItemId, setSavingItemId] = useState<number | null>(null)

  const statsQuery = useQuery({ queryKey: ['enrichment-stats'], queryFn: fetchEnrichmentStats })
  const queueQuery = useQuery({
    queryKey: ['enrichment-queue', stage, limit],
    queryFn: () => fetchEnrichmentQueue(stage, limit)
  })

  // Run the full pipeline for `limit` items (your backend run-all endpoint processes stages internally)
  const runAllMutation = useMutation({
    mutationFn: () => runFullPipeline(limit),
    onSuccess: () => {
      statsQuery.refetch()
      queueQuery.refetch()
    },
    onError: (error) => {
      alert(`Failed to run full pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  })

  // Run the full pipeline but only for 1 item (useful for testing)
  const runSingleMutation = useMutation({
    mutationFn: () => runFullPipeline(1),
    onSuccess: (result) => {
      statsQuery.refetch()
      queueQuery.refetch()

      const summary = result?.stages
        ?.map((stageResult) => {
          const completed = stageResult.linked ?? stageResult.updated ?? 0
          const reviewed = stageResult.needs_review ?? 0
          return `${stageResult.stage}: ${completed} updated, ${reviewed} needs review`
        })
        ?.join('\n')

      if (summary) {
        alert(`Single-item enrichment run completed:\n${summary}`)
      }
    },
    onError: (error) => {
      alert(`Failed to run single-item pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  })

  // Run enrichment for a specific queue row (item)
  const runItemMutation = useMutation({
    mutationFn: (itemId: number) => runEnrichmentForItem(itemId),
    onMutate: (itemId) => {
      setActiveItemId(itemId)
    },
    onSuccess: (result) => {
      statsQuery.refetch()
      queueQuery.refetch()

      const summary = result?.stages
        ?.map((stageResult) => {
          const completed = stageResult.linked ?? stageResult.updated ?? 0
          const reviewed = stageResult.needs_review ?? 0
          return `${stageResult.stage}: ${completed} updated, ${reviewed} needs review`
        })
        ?.join('\n')

      if (summary) {
        alert(`Enrichment run for item ${result.itemId} completed:\n${summary}`)
      }
    },
    onError: (error) => {
      alert(`Failed to enrich item: ${error instanceof Error ? error.message : 'Unknown error'}`)
    },
    onSettled: () => {
      setActiveItemId(null)
    }
  })

  const updateFieldsMutation = useMutation({
    mutationFn: updateEnrichmentItem,
    onMutate: (payload) => {
      setSavingItemId(payload.itemId)
    },
    onSuccess: () => {
      statsQuery.refetch()
      queueQuery.refetch()
    },
    onError: (error) => {
      alert(`Failed to update enrichment fields: ${error instanceof Error ? error.message : 'Unknown error'}`)
    },
    onSettled: () => {
      setSavingItemId(null)
    }
  })

  const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('sv-SE') : '—')
  const formatText = (value?: string | null) => value?.toString().trim() || '—'

  const appliedLimit = useMemo(() => {
    const parsed = Number(limitInput)
    const next = Math.min(500, Math.max(10, Number.isFinite(parsed) ? parsed : limit))
    return next
  }, [limit, limitInput])

  const applyLimit = () => {
    setLimit(appliedLimit)
    setLimitInput(String(appliedLimit))
  }

  const stats: EnrichmentStats | undefined = statsQuery.data
  const queueRows: EnrichmentQueueRow[] = queueQuery.data?.rows || []

  const invariants = stats?.invariants || {
    linked_but_not_matched_status: 0,
    linked_but_missing_fields: 0,
    matched_status_but_unlinked: 0
  }

  const hasInvariantIssue = Object.values(invariants).some((value) => value > 0)

  const loadAudit = async (itemId: number) => {
    const data = await fetchEnrichmentAudit(itemId)
    alert(JSON.stringify(data, null, 2))
  }

  const funnelSteps = stats
    ? [
        { key: 'era', label: 'Era found', value: stats.stages.era_reached },
        { key: 'set', label: 'Set found', value: stats.stages.set_reached },
        { key: 'number', label: 'Number found', value: stats.stages.number_reached },
        { key: 'name', label: 'Name verified', value: stats.stages.name_reached },
        { key: 'ready', label: 'Ready to link', value: stats.stages.ready_to_link },
        { key: 'linked', label: 'Linked', value: stats.linked_total }
      ]
    : []

  const bottlenecks = stats?.bottlenecks

  const stageActionLabel = (value: StageKey) => {
    switch (value) {
      case 'era':
        return 'Detect era'
      case 'set':
        return 'Detect set'
      case 'number':
        return 'Extract number'
      case 'name':
        return 'Verify card'
      case 'ready_to_link':
        return 'Link card'
      case 'link':
        return 'Linked'
      default:
        return 'Run stage'
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-slate-500">Card Matching Funnel</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Staged card matching funnel</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Track how auctions progress from raw data to linked Pokémon cards. Each stage only advances once the prior
            gates are complete.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Keep the stage button for UI context, but it currently runs the full pipeline with the configured limit.
              If you later add a "run stage" endpoint, you can swap mutationFn here. */}
          <Button onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending}>
            {runAllMutation.isPending ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {runAllMutation.isPending ? 'Running…' : `${stageActionLabel(stage)} (${limit})`}
          </Button>

          <Button variant="secondary" onClick={() => runSingleMutation.mutate()} disabled={runSingleMutation.isPending}>
            {runSingleMutation.isPending ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
            {runSingleMutation.isPending ? 'Running one…' : 'Run one item'}
          </Button>

          <Button variant="outline" onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending}>
            {runAllMutation.isPending ? 'Running full pipeline…' : 'Run full pipeline'}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Funnel progress</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Counts show how many auctions have reached at least each milestone, turning enrichment into visible
              momentum.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats && (
            <div className="grid gap-3 lg:grid-cols-6">
              {funnelSteps.map((step, index) => (
                <FunnelStepCard
                  key={step.key}
                  label={step.label}
                  value={step.value}
                  showArrow={index < funnelSteps.length - 1}
                />
              ))}
            </div>
          )}

          {hasInvariantIssue && (
            <div className="flex items-center gap-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4" />
              <div>
                <p className="font-semibold">Invariant warnings</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Linked but status not matched: {invariants.linked_but_not_matched_status}</li>
                  <li>Linked but missing fields: {invariants.linked_but_missing_fields}</li>
                  <li>Matched status but unlinked: {invariants.matched_status_but_unlinked}</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current bottlenecks</CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Focus on the stages that are actively blocking progress toward linking.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          {bottlenecks ? (
            <div className="grid gap-3 md:grid-cols-3">
              <BottleneckCard label="Card number unresolved" value={bottlenecks.needs_number} tone="warning" />
              <BottleneckCard label="Card name unresolved" value={bottlenecks.needs_name} tone="info" />
              <BottleneckCard label="Ready to link" value={bottlenecks.ready_to_link} tone="success" />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading bottleneck data…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Stage queue</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Review auctions by their next required step to keep the funnel moving.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Next step</label>
            <select
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              value={stage}
              onChange={(e) => setStage(e.target.value as StageKey)}
            >
              {STAGE_FILTERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>

            <label className="text-[11px] uppercase tracking-wide text-slate-500">Limit</label>
            <Input
              className="h-9 w-24"
              type="number"
              min={10}
              max={500}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
            />

            <Button size="sm" variant="outline" onClick={applyLimit}>
              Apply
            </Button>

            <Button size="sm" variant="ghost" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {queueRows.map((row) => (
                  <TableRow key={row.item_id}>
                    <TableCell className="font-mono text-xs">{row.item_id}</TableCell>
                    <TableCell className="min-w-[220px]">{formatText(row.title)}</TableCell>
                    <TableCell>
                      <ProgressStack
                        row={row}
                        onSave={(payload) => updateFieldsMutation.mutate(payload)}
                        isSaving={savingItemId === row.item_id}
                      />
                    </TableCell>
                    <TableCell>{formatDateTime(row.updated_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          size="sm"
                          onClick={() => runItemMutation.mutate(row.item_id)}
                          disabled={runItemMutation.isPending && activeItemId === row.item_id}
                        >
                          {runItemMutation.isPending && activeItemId === row.item_id
                            ? 'Enriching…'
                            : stageActionLabel(getNextRequiredStep(row))}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => loadAudit(row.item_id)}>
                          Audit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {queueRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      No rows available for this stage.
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

function FunnelStepCard({ label, value, showArrow }: { label: string; value: number; showArrow?: boolean }) {
  return (
    <div className="relative rounded border border-slate-200 bg-white p-3 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 dark:text-slate-50">{value.toLocaleString('sv-SE')}</p>
      {showArrow && (
        <span className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-400 md:flex">
          →
        </span>
      )}
    </div>
  )
}

function BottleneckCard({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone: 'warning' | 'info' | 'success'
}) {
  const toneClasses =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-blue-200 bg-blue-50 text-blue-900'

  return (
    <div className={`rounded border p-3 shadow-sm ${toneClasses}`}>
      <p className="text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold">{value.toLocaleString('sv-SE')}</p>
    </div>
  )
}

const STEP_LABELS = {
  era: 'Era',
  set: 'Set',
  number: 'Card number',
  name: 'Card name',
  ready_to_link: 'Link card',
  link: 'Linked'
} as const

function getNextRequiredStep(row: EnrichmentQueueRow): StageKey {
  if (!row.matched_era) return 'era'
  if (!row.matched_set_code) return 'set'
  if (!row.parsed_card_number) return 'number'
  if (!row.parsed_card_name) return 'name'
  if (!row.card_id) return 'ready_to_link'
  return 'link'
}

function ProgressStack({
  row,
  onSave,
  isSaving
}: {
  row: EnrichmentQueueRow
  onSave: (payload: {
    itemId: number
    matched_era?: string | null
    matched_set_code?: string | null
    parsed_card_number?: string | null
    parsed_card_name?: string | null
  }) => void
  isSaving: boolean
}) {
  const steps = [
    { key: 'era', label: 'ERA', complete: Boolean(row.matched_era) },
    { key: 'set', label: 'SET', complete: Boolean(row.matched_set_code) },
    { key: 'number', label: 'NUMBER', complete: Boolean(row.parsed_card_number) },
    { key: 'name', label: 'NAME', complete: Boolean(row.parsed_card_name) },
    { key: 'link', label: 'LINK', complete: Boolean(row.card_id) }
  ]

  const nextStep = getNextRequiredStep(row)
  const nextLabel = STEP_LABELS[nextStep] ?? 'Next step'
  const [matchedEra, setMatchedEra] = useState(row.matched_era ?? '')
  const [matchedSet, setMatchedSet] = useState(row.matched_set_code ?? '')
  const [parsedNumber, setParsedNumber] = useState(row.parsed_card_number ?? '')
  const [parsedName, setParsedName] = useState(row.parsed_card_name ?? '')

  useEffect(() => {
    setMatchedEra(row.matched_era ?? '')
    setMatchedSet(row.matched_set_code ?? '')
    setParsedNumber(row.parsed_card_number ?? '')
    setParsedName(row.parsed_card_name ?? '')
  }, [row.matched_era, row.matched_set_code, row.parsed_card_number, row.parsed_card_name])

  const hasChanges =
    matchedEra !== (row.matched_era ?? '') ||
    matchedSet !== (row.matched_set_code ?? '') ||
    parsedNumber !== (row.parsed_card_number ?? '') ||
    parsedName !== (row.parsed_card_name ?? '')

  const handleSave = () => {
    onSave({
      itemId: row.item_id,
      matched_era: matchedEra.trim() ? matchedEra.trim() : null,
      matched_set_code: matchedSet.trim() ? matchedSet.trim() : null,
      parsed_card_number: parsedNumber.trim() ? parsedNumber.trim() : null,
      parsed_card_name: parsedName.trim() ? parsedName.trim() : null
    })
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
        <span>Stage</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {row.stage || '—'}
        </span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100">
          {row.status || '—'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
        {steps.map((step, index) => {
          const isCurrent = !step.complete && nextStep !== 'link' && nextStep === step.key
          const isLinkStep = step.key === 'link' && nextStep === 'ready_to_link'
          const baseClasses = step.complete
            ? 'bg-emerald-500 text-white'
            : isCurrent || isLinkStep
              ? 'bg-amber-400 text-amber-950'
              : 'bg-slate-200 text-slate-500'

          return (
            <div key={step.key} className="flex items-center gap-1">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${baseClasses}`}>
                {step.complete ? '✓' : step.label[0]}
              </span>
              <span>{step.label}</span>
              {index < steps.length - 1 && <span className="text-slate-300">—</span>}
            </div>
          )
        })}
      </div>

      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        Next required step:{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{nextLabel}</span>
      </div>

      <div className="grid gap-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
        <FieldEditor label="ERA" value={matchedEra} onChange={setMatchedEra} placeholder="e.g. Scarlet & Violet" />
        <FieldEditor label="SET" value={matchedSet} onChange={setMatchedSet} placeholder="e.g. SV4.5" />
        <FieldEditor label="NUMBER" value={parsedNumber} onChange={setParsedNumber} placeholder="e.g. 102" />
        <FieldEditor label="NAME" value={parsedName} onChange={setParsedName} placeholder="e.g. Charizard" />
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? 'Saving…' : 'Save fields'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FieldEditor({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-500">
      <span>{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 bg-white text-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  )
}
