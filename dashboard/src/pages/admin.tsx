import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarClock, CheckCircle2, RefreshCw, Shield, UploadCloud, Users } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { registeredUsers } from '../data/users'
import { useAdminSettings } from '../providers/admin-settings'
import { fetchAuctionDiagnostics, fetchAuctions } from '../lib/api'
import type { AuctionRecord } from '../types'

export function AdminPage(): JSX.Element {
  const { importSettings, updateImportSchedule } = useAdminSettings()
  const [date, setDate] = useState(() => format(new Date(importSettings.nextImportAt), 'yyyy-MM-dd'))
  const [time, setTime] = useState(() => format(new Date(importSettings.nextImportAt), 'HH:mm'))
  const {
    data: auctions,
    refetch: refetchAuctions,
    isFetching,
    error: auctionsError
  } = useQuery<AuctionRecord[]>({ queryKey: ['auctions'], queryFn: fetchAuctions })
  const [lastManualCheckAt, setLastManualCheckAt] = useState<string | null>(null)
  const [manualCheckNote, setManualCheckNote] = useState<string | null>(null)
  const [manualCheckPending, setManualCheckPending] = useState(false)

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

  const importSummary = useMemo(() => {
    if (!auctions || auctions.length === 0) {
      return {
        importedCount: importSettings.importedCount,
        oldest: importSettings.oldestAuctionEndedAt,
        newest: importSettings.newestAuctionEndedAt
      }
    }

    const sorted = [...auctions].sort(
      (a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
    )

    return {
      importedCount: auctions.length,
      oldest: sorted[0].endTime,
      newest: sorted[sorted.length - 1].endTime
    }
  }, [auctions, importSettings])

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    updateImportSchedule(date, time)
  }

  const handleManualImport = async (): Promise<void> => {
    setManualCheckNote(null)
    setLastManualCheckAt(null)
    setManualCheckPending(true)
    try {
      const diagnostics = await fetchAuctionDiagnostics()
      const sourceLabel = diagnostics.source === 'database' ? 'database (live)' : 'mock fallback'
      const count = diagnostics.auctions?.length ?? 0
      const baseMessage = `Importer responded with ${count.toLocaleString('sv-SE')} auctions from ${sourceLabel}.`
      const note = diagnostics.error
        ? `${baseMessage} Database error: ${diagnostics.error}`
        : baseMessage
      setManualCheckNote(note)
    } catch (error) {
      console.error('Manual import check failed', error)
      setManualCheckNote('The importer did not respond. Please verify credentials and the database connection.')
    } finally {
      setLastManualCheckAt(new Date().toISOString())
      setManualCheckPending(false)
    try {
      const result = await refetchAuctions()
      const count = result.data?.length ?? 0
      setManualCheckNote(
        result.error
          ? 'The importer did not respond. Please verify credentials and the database connection.'
          : `Latest fetch returned ${count.toLocaleString('sv-SE')} auctions.`
      )
      setLastManualCheckAt(new Date().toISOString())
    } catch (error) {
      console.error('Manual import check failed', error)
      setManualCheckNote('The importer did not respond. Please verify credentials and the database connection.')
      setLastManualCheckAt(new Date().toISOString())
    }
  }

  const formattedCoverageRange = `${format(new Date(importSettings.coverageStart), 'PP')} – ${format(
    new Date(importSettings.coverageEnd),
    'PP'
  )}`
  const formattedOldest = importSummary.oldest ? format(new Date(importSummary.oldest), 'PPpp') : '—'
  const formattedNewest = importSummary.newest ? format(new Date(importSummary.newest), 'PPpp') : '—'
  const formattedLastImport = format(new Date(importSettings.lastImportAt), 'PPpp')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Control center</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Monitor registered users and steer the Tradera import cadence.</p>
        </div>
        <Badge variant="secondary" className="inline-flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Restricted area
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Billing status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registeredUsers.map((user) => (
                    <TableRow key={user.email}>
                      <TableCell className="font-semibold text-slate-100">{user.name}</TableCell>
                      <TableCell className="text-slate-300">{user.email}</TableCell>
                      <TableCell>
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
                          {user.subscription}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.seats}</TableCell>
                      <TableCell className="capitalize">{user.role}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-sky-300" />
                Tradera import cadence
              </CardTitle>
              <CardDescription>
                Decide when to sweep ended auctions and make the plan visible to every user.
              </CardDescription>
            </div>
            <Button
              onClick={handleManualImport}
              disabled={isFetching || manualCheckPending}
              variant="secondary"
              className="gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              {manualCheckPending ? 'Contacting importer…' : 'Import new'}
            <Button onClick={handleManualImport} disabled={isFetching} variant="secondary" className="gap-2">
              <UploadCloud className="h-4 w-4" />
              {isFetching ? 'Contacting importer…' : 'Import new'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-900/70 dark:bg-slate-900/50 dark:text-slate-200">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Next import</p>
              <p className="text-slate-700 dark:text-slate-300">{format(new Date(importSettings.nextImportAt), 'PPpp')}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{importSettings.coverageLabel}</p>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Import date</span>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </label>
              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Import time</span>
                <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
              </label>
              <Button type="submit" className="sm:col-span-2">
                <RefreshCw className="mr-2 h-4 w-4" /> Update schedule
              </Button>
            </form>

            <div className="flex items-start gap-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <Users className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>
                Once saved, the import window is broadcast across the app so teammates know when the Tradera sweep will run and
                that it always targets yesterday&apos;s finished auctions.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-slate-900/60 dark:bg-slate-950/40 dark:text-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">Manual import check</p>
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                {manualCheckNote ?? 'Run an import check to confirm the Tradera feed responds with new auctions.'}
              </p>
              {lastManualCheckAt && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Last checked {format(new Date(lastManualCheckAt), 'PPpp')}.
                </p>
              )}
              {auctionsError && (
                <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                  Live importer error: {String(auctionsError)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              Import status
            </CardTitle>
            <CardDescription>Freshness and coverage for the ended auction archive.</CardDescription>
          </div>
          <Badge variant={importSettings.lastImportStatus === 'success' ? 'success' : 'warning'}>
            {importSettings.lastImportStatus}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Last import run</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{formattedLastImport}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Auctions imported</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{importSummary.importedCount.toLocaleString('sv-SE')}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Date range covered</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{formattedCoverageRange}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{importSettings.coverageLabel}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Oldest auction in database</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{formattedOldest}</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Newest auction in database</p>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{formattedNewest}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
