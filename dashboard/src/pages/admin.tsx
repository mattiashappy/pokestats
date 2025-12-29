import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { History, Shield, Sparkles } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { registeredUsers } from '../data/users'
import { fetchEnrichmentSummary, fetchImportRuns, fetchUnmatchedAuctions, runEnrichment, runImporter } from '../lib/api'
import type { EnrichmentSummary, ImportRun, UnmatchedAuction } from '../lib/api'

export function AdminPage(): JSX.Element {
  const {
    data: enrichmentSummary,
    refetch: refetchEnrichment,
    isFetching: isFetchingEnrichment
  } = useQuery<EnrichmentSummary>({ queryKey: ['enrichment-summary'], queryFn: fetchEnrichmentSummary })
  const {
    data: importRuns,
    refetch: refetchImportRuns,
    isFetching: isFetchingImportRuns
  } = useQuery<ImportRun[]>({ queryKey: ['import-runs'], queryFn: () => fetchImportRuns(15) })
  const {
    data: unmatched,
    refetch: refetchUnmatched,
    isFetching: isFetchingUnmatched
  } = useQuery<UnmatchedAuction[]>({ queryKey: ['enrichment-unmatched'], queryFn: () => fetchUnmatchedAuctions(25) })
  const [enrichmentRunResult, setEnrichmentRunResult] = useState<string | null>(null)
  const [enrichmentRunPending, setEnrichmentRunPending] = useState(false)
  const [importRunResult, setImportRunResult] = useState<string | null>(null)
  const [importRunPending, setImportRunPending] = useState(false)

  const totals = useMemo(() => {
    return registeredUsers.reduce(
      (acc, user) => {
        acc[user.subscription] += 1
        acc.seats += user.seats
        return acc
      },
      { active: 0, inactive: 0, trialing: 0, seats: 0 }
    )
  }, [])

  const handleRunEnrichment = async (): Promise<void> => {
    setEnrichmentRunResult(null)
    setEnrichmentRunPending(true)
    try {
      const result = await runEnrichment(400, 80)
      setEnrichmentRunResult(
        `Attempted ${result.attempted}, linked ${result.linked}, needs review ${result.needsReview}, unmatched ${result.unmatched}.`
      )
      await refetchEnrichment()
      await refetchUnmatched()
    } catch (e) {
      setEnrichmentRunResult(`Enrichment failed: ${String(e)}`)
    } finally {
      setEnrichmentRunPending(false)
    }
  }

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
      await refetchEnrichment()
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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Control center</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Monitor registered users and keep data enrichment healthy.
          </p>
        </div>
        <Badge variant="secondary" className="inline-flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Restricted area
        </Badge>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Registered users</CardTitle>
              <CardDescription>Preview of who can access PokéStats today.</CardDescription>
            </div>
            <Badge variant="success">{totals.seats} seats</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500">Active</p>
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-200">{totals.active}</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500">Trialing</p>
                <p className="text-2xl font-semibold text-sky-600 dark:text-sky-200">{totals.trialing}</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500">Inactive</p>
                <p className="text-2xl font-semibold text-amber-600 dark:text-amber-200">{totals.inactive}</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-900/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Name</TableHead>
                    <TableHead className="text-left">Email</TableHead>
                    <TableHead className="text-left">Billing status</TableHead>
                    <TableHead className="text-left">Status</TableHead>
                    <TableHead className="text-left">Seats</TableHead>
                    <TableHead className="text-left">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registeredUsers.map((user) => (
                    <TableRow key={user.email}>
                      <TableCell className="text-left font-semibold text-slate-100">{user.name}</TableCell>
                      <TableCell className="text-left text-slate-300">{user.email}</TableCell>
                      <TableCell className="text-left">
                        <Badge
                          variant={
                            user.subscription === 'active'
                              ? 'success'
                              : user.subscription === 'trialing'
                                ? 'secondary'
                                : 'warning'
                          }
                        >
                          {user.billingPlan === 'comped' ? 'comped (admin)' : user.subscription}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-left">{user.seats}</TableCell>
                      <TableCell className="text-left capitalize">{user.role}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-300" />
                Data enrichment
              </CardTitle>
              <CardDescription>
                Watch raw imports land before linking auctions to card records—without altering the original feed.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleRunEnrichment}
                variant="secondary"
                size="sm"
                className="gap-2"
                disabled={enrichmentRunPending || isFetchingEnrichment || isFetchingUnmatched}
              >
                <Sparkles className="h-4 w-4" />
                {enrichmentRunPending ? 'Running…' : 'Run enrichment'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Last import started</p>
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
                <p className="text-xs uppercase tracking-wide text-slate-500">Import status</p>
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Auction imports</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Review recent runs or trigger a fresh sync.
                </p>
              </div>
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

            <div className="overflow-hidden rounded-xl border border-slate-900/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Started</TableHead>
                    <TableHead className="text-left">Status</TableHead>
                    <TableHead className="text-left">New rows</TableHead>
                    <TableHead className="text-left">Requests</TableHead>
                    <TableHead className="text-left">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(importRuns ?? []).map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-left text-slate-300">{format(new Date(run.started_at), 'PPpp')}</TableCell>
                      <TableCell className="text-left capitalize text-slate-100">{run.status}</TableCell>
                      <TableCell className="text-left text-slate-300">{run.new_rows.toLocaleString('sv-SE')}</TableCell>
                      <TableCell className="text-left text-slate-300">{run.requests_used}</TableCell>
                      <TableCell className="text-left text-slate-300">{run.message ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(!importRuns || importRuns.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-300">
                        No import runs logged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total auctions</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {enrichmentSummary?.totalAuctions?.toLocaleString('sv-SE') ?? '—'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">All rows imported from Tradera.</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Linked to cards</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {enrichmentSummary?.linkedAuctions?.toLocaleString('sv-SE') ?? '—'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Augmented with card metadata for browsing.</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Awaiting enrichment</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {enrichmentSummary?.unlinkedAuctions?.toLocaleString('sv-SE') ?? 0}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Still to be matched with card details.</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Needs review</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {enrichmentSummary?.needsReview?.toLocaleString('sv-SE') ?? 0}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Listings requiring manual checks.</p>
              </div>
            </div>

            {enrichmentRunResult ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">Last enrichment run</p>
                <p className="mt-1 text-slate-900 dark:text-slate-50">{enrichmentRunResult}</p>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-900/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Ended</TableHead>
                    <TableHead className="text-left">Title</TableHead>
                    <TableHead className="text-left">Set guess</TableHead>
                    <TableHead className="text-left">Number</TableHead>
                    <TableHead className="text-left">Status</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(unmatched ?? []).map((row) => (
                    <TableRow key={row.item_id}>
                      <TableCell className="text-left text-slate-300">{format(new Date(row.end_date), 'PP')}</TableCell>
                      <TableCell className="text-left font-medium text-slate-100">{row.title}</TableCell>
                      <TableCell className="text-left text-slate-300">{row.parsed_set_guess ?? '—'}</TableCell>
                      <TableCell className="text-left text-slate-300">{row.parsed_number_text ?? '—'}</TableCell>
                      <TableCell className="text-left text-slate-300">{row.enrich_status ?? '—'}</TableCell>
                      <TableCell className="text-right text-slate-300">{row.enrich_confidence ?? 0}</TableCell>
                    </TableRow>
                  ))}
                  {(!unmatched || unmatched.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-300">
                        No unmatched auctions found (nice).
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
