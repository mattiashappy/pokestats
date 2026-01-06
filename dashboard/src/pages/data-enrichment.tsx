import { type ReactNode, useMemo, useState } from 'react'
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
  runEnrichmentStage,
  runFullPipeline,
  type EnrichmentQueueRow,
  type EnrichmentStats
} from '../lib/api'

const STAGES = ['era', 'set', 'number', 'name', 'ready_to_link'] as const

type StageKey = (typeof STAGES)[number]

export function DataEnrichmentPage(): JSX.Element {
  const [stage, setStage] = useState<StageKey>('era')
  const [limit, setLimit] = useState(50)
  const [limitInput, setLimitInput] = useState('50')

  const statsQuery = useQuery({ queryKey: ['enrichment-stats'], queryFn: fetchEnrichmentStats })
  const queueQuery = useQuery({
    queryKey: ['enrichment-queue', stage, limit],
    queryFn: () => fetchEnrichmentQueue(stage, limit)
  })

  const runStageMutation = useMutation({
    mutationFn: () => runEnrichmentStage(stage, limit),
    onSuccess: () => {
      statsQuery.refetch()
      queueQuery.refetch()
    }
  })

  const runAllMutation = useMutation({
    mutationFn: () => runFullPipeline(limit),
    onSuccess: () => {
      statsQuery.refetch()
      queueQuery.refetch()
    }
  })

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
    }
  })

  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString('sv-SE') : '—'

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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-slate-500">Data Enrichment</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Staged auction pipeline</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Single enrichment pass runs ERA → SET → NUMBER → NAME before linking. Rows only advance when their stage succeeds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => runStageMutation.mutate()} disabled={runStageMutation.isPending}>
            {runStageMutation.isPending ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {runStageMutation.isPending ? 'Running…' : `Run ${stage.toUpperCase()}`}
          </Button>
          <Button
            variant="secondary"
            onClick={() => runSingleMutation.mutate()}
            disabled={runSingleMutation.isPending}
          >
            {runSingleMutation.isPending ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4" />
            )}
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
            <CardTitle>Pipeline overview</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Counts per stage plus invariant checks to ensure card links only happen after all gates are met.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats && (
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <StageCount label="ERA missing" value={stats.stages.era_missing} />
              <StageCount label="SET missing" value={stats.stages.set_missing} />
              <StageCount label="NUMBER missing" value={stats.stages.number_missing} />
              <StageCount label="NAME missing" value={stats.stages.name_missing} />
              <StageCount label="Ready to link" value={stats.stages.ready_to_link} />
              <StageCount label="Linked" value={stats.linked_total} />
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
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Stage queue</CardTitle>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              View and audit rows currently eligible for a given stage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-[11px] uppercase tracking-wide text-slate-500">Stage</label>
            <select
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              value={stage}
              onChange={(e) => setStage(e.target.value as StageKey)}
            >
              {STAGES.map((key) => (
                <option key={key} value={key}>
                  {key}
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
                  <TableHead>Status</TableHead>
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
                      <StatusStack
                        stage={formatText(row.stage)}
                        status={formatText(row.status)}
                        steps={[
                          { label: 'Era', value: formatText(row.matched_era) },
                          { label: 'Set', value: formatText(row.matched_set_code) },
                          { label: 'Number', value: formatText(row.parsed_card_number) },
                          { label: 'Name', value: formatText(row.parsed_card_name) },
                          { label: 'Card', value: formatCardLink(row) }
                        ]}
                      />
                    </TableCell>
                    <TableCell>{formatDateTime(row.updated_at)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => loadAudit(row.item_id)}>
                        Audit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StageCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 dark:text-slate-50">{value.toLocaleString('sv-SE')}</p>
    </div>
  )
}

function StatusStack({
  stage,
  status,
  steps
}: {
  stage: string
  status: string
  steps: { label: string; value: ReactNode }[]
}) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
        <span>Stage</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {stage}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-1">
        {steps.map((step) => (
          <div
            key={step.label}
            className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-2 py-1 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200"
          >
            <span className="font-medium text-slate-600 dark:text-slate-300">{step.label}</span>
            <span className="truncate text-right text-slate-800 dark:text-slate-50">{step.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
        <span>Status</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100">
          {status}
        </span>
      </div>
    </div>
  )
}

function formatCardLink(row: { card_id: number | null }) {
  if (row.card_id) {
    return (
      <a href={`/pokemon/cards/${row.card_id}`} className="text-blue-600 hover:underline dark:text-blue-300">
        View card #{row.card_id}
      </a>
    )
  }

  return '—'
}
