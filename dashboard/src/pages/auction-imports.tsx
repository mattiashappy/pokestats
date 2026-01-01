import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { History } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../components/ui/dialog'
import { ScrollArea } from '../components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchImportRun, fetchImportRuns, runImporter } from '../lib/api'
import type { ImportRun } from '../lib/api'

export function AuctionImportsPage(): JSX.Element {
  const {
    data: importRuns,
    refetch: refetchImportRuns,
    isFetching: isFetchingImportRuns
  } = useQuery<ImportRun[]>({
    queryKey: ['import-runs'],
    queryFn: () => fetchImportRuns(15),
    refetchInterval: (query) => (query.state.data?.[0]?.status === 'running' ? 3000 : false)
  })

  const [importRunResult, setImportRunResult] = useState<string | null>(null)
  const [importRunPending, setImportRunPending] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const {
    data: selectedRunDetails,
    isFetching: isFetchingRunDetails
  } = useQuery<ImportRun>({
    queryKey: ['import-run', selectedRunId],
    queryFn: () => fetchImportRun(selectedRunId || 0),
    enabled: detailsOpen && selectedRunId != null
  })

  const selectedRun = (importRuns ?? []).find((run) => run.id === selectedRunId) || null
  const runForDetails = selectedRunDetails || selectedRun || null

  const handleRunImporter = async (): Promise<void> => {
    setImportRunResult(null)
    setImportRunPending(true)
    try {
      const result = await runImporter()
      const seconds = Math.max(1, Math.round(result.durationMs / 1000))
      setImportRunResult(
        `Ran importer at ${format(new Date(result.startedAt), 'PPpp')} and added ${result.newRows.toLocaleString('sv-SE')} auctions in ~${seconds}s.`
      )
      await refetchImportRuns()
    } catch (e) {
      setImportRunResult(`Import failed: ${String(e)}`)
    } finally {
      setImportRunPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Auction imports</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Track when the Tradera feed last brought in new auctions and trigger a manual refresh.
          </p>
        </div>
        <Badge variant="secondary" className="inline-flex items-center gap-2">
          <History className="h-4 w-4 text-amber-500" />
          Import monitor
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-amber-500" />
              Auction imports
            </CardTitle>
            <CardDescription>
              Track when the Tradera feed last brought in new auctions and trigger a manual refresh.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={handleRunImporter}
              variant="secondary"
              size="sm"
              className="gap-2"
              disabled={importRunPending || isFetchingImportRuns}
            >
              <History className="h-4 w-4" />
              {importRunPending ? 'Running…' : 'Run importer'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last started</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {importRuns?.[0]?.started_at ? format(new Date(importRuns[0].started_at), 'PPpp') : '—'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Time the importer most recently kicked off.</p>
            </div>

            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">New auctions</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {importRuns?.[0]?.new_rows?.toLocaleString('sv-SE') ?? '—'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Added during the latest importer run.</p>
            </div>

            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50 capitalize">
                {importRuns?.[0]?.status ?? '—'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Latest import outcome.</p>
            </div>
          </div>

          {importRunResult ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last import run</p>
              <p className="mt-1 text-slate-900 dark:text-slate-50">{importRunResult}</p>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-900/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Started</TableHead>
                  <TableHead className="text-left">Status</TableHead>
                  <TableHead className="text-left">New rows</TableHead>
                  <TableHead className="text-left">Requests</TableHead>
                  <TableHead className="text-left">Notes</TableHead>
                  <TableHead className="text-left">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(importRuns ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-left text-slate-600 dark:text-slate-300">
                      {format(new Date(run.started_at), 'PPpp')}
                    </TableCell>
                    <TableCell className="text-left capitalize text-slate-900 dark:text-slate-50">{run.status}</TableCell>
                    <TableCell className="text-left text-slate-600 dark:text-slate-300">
                      {run.new_rows.toLocaleString('sv-SE')}
                    </TableCell>
                    <TableCell className="text-left text-slate-600 dark:text-slate-300">{run.requests_used}</TableCell>
                    <TableCell className="text-left text-slate-600 dark:text-slate-300">{run.message ?? '—'}</TableCell>
                    <TableCell className="text-left">
                      <Dialog open={detailsOpen && selectedRunId === run.id} onOpenChange={setDetailsOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRunId(run.id)}
                            className="min-w-[72px]"
                          >
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader className="space-y-1">
                            <DialogTitle>Import run #{run.id}</DialogTitle>
                            <DialogDescription className="text-xs">
                              {run.started_at ? format(new Date(run.started_at), 'PPpp') : 'Unknown start time'}
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-md bg-slate-100 p-3 dark:bg-slate-900/70">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                                <p className="font-semibold capitalize">{runForDetails?.status ?? run.status}</p>
                              </div>
                              <div className="rounded-md bg-slate-100 p-3 dark:bg-slate-900/70">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Run UUID</p>
                                <p className="font-semibold break-all">{runForDetails?.run_uuid ?? run.run_uuid ?? '—'}</p>
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Message</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm">{runForDetails?.message ?? run.message ?? '—'}</p>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                              <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Traceback</p>
                                {isFetchingRunDetails ? (
                                  <span className="text-xs text-slate-500">Loading…</span>
                                ) : null}
                              </div>
                              <ScrollArea className="mt-2 max-h-[300px] rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                <pre className="whitespace-pre-wrap">
                                  {runForDetails?.error_stack || run.error_stack_preview || 'No traceback recorded.'}
                                </pre>
                              </ScrollArea>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
                {(!importRuns || importRuns.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-600 dark:text-slate-300">
                      No import runs logged yet.
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
