import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { History, Shield } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { registeredUsers } from '../data/users'
import { fetchImportRuns, runImporter } from '../lib/api'
import type { ImportRun } from '../lib/api'

export function AdminPage(): JSX.Element {
  const {
    data: importRuns,
    refetch: refetchImportRuns,
    isFetching: isFetchingImportRuns
  } = useQuery<ImportRun[]>({ queryKey: ['import-runs'], queryFn: () => fetchImportRuns(15) })

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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Control center</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Monitor registered users and keep auction imports healthy.
          </p>
        </div>
        <Badge variant="secondary" className="inline-flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Restricted area
        </Badge>
      </div>

      <div className="grid gap-4">
        {/* Auction imports */}
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
                    </TableRow>
                  ))}
                  {(!importRuns || importRuns.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-600 dark:text-slate-300">
                        No import runs logged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Registered users */}
        <Card>
          <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Registered users</CardTitle>
              <CardDescription>Preview of who can access PokéStats today.</CardDescription>
            </div>
            <div className="flex shrink-0 items-center">
              <Badge variant="success">{totals.seats} seats</Badge>
            </div>
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
                      <TableCell className="text-left font-semibold text-slate-900 dark:text-slate-50">{user.name}</TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">{user.email}</TableCell>
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
                      <TableCell className="text-left capitalize text-slate-600 dark:text-slate-300">
                        {user.subscription}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">{user.seats}</TableCell>
                      <TableCell className="text-left capitalize text-slate-600 dark:text-slate-300">{user.role}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}