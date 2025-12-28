import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  CalendarClock,
  CheckCircle2,
  Database,
  ListChecks,
  RefreshCw,
  Shield,
  Sparkles,
  UploadCloud,
  Users
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { registeredUsers } from '../data/users'
import { useAdminSettings } from '../providers/admin-settings'
import { fetchAuctionDiagnostics, fetchAuctions, fetchEnrichmentSummary, runEnrichment } from '../lib/api'
import type { AuctionRecord, EnrichmentSummary } from '../types'

export function AdminPage(): JSX.Element {
  const { importSettings } = useAdminSettings()
  const {
    data: auctions,
    refetch: refetchAuctions,
    isFetching,
    error: auctionsError
  } = useQuery<AuctionRecord[]>({ queryKey: ['auctions'], queryFn: fetchAuctions })
  const {
    data: enrichmentSummary,
    refetch: refetchEnrichment,
    isFetching: isFetchingEnrichment
  } = useQuery<EnrichmentSummary>({ queryKey: ['enrichment-summary'], queryFn: fetchEnrichmentSummary })
  const [lastManualCheckAt, setLastManualCheckAt] = useState<string | null>(null)
  const [manualCheckNote, setManualCheckNote] = useState<string | null>(null)
  const [manualCheckPending, setManualCheckPending] = useState(false)
  const [enrichmentNote, setEnrichmentNote] = useState<string | null>(null)
  const [enrichmentPending, setEnrichmentPending] = useState(false)

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
      await refetchAuctions()
    } catch (error) {
      console.error('Manual import check failed', error)
      setManualCheckNote('The importer did not respond. Please verify credentials and the database connection.')
    }
    setLastManualCheckAt(new Date().toISOString())
    setManualCheckPending(false)
  }

  const rawAuctions = useMemo(() => {
    if (!auctions?.length) return []
    return [...auctions]
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
      .slice(0, 8)
  }, [auctions])

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
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Monitor registered users and keep the Tradera import and enrichment healthy.
          </p>
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
                Imports now run daily through the Heroku Scheduler. Use this panel to verify the source feed without changing the
                upstream Tradera data.
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
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-900/70 dark:bg-slate-900/50 dark:text-slate-200">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Next import</p>
              <p className="text-slate-700 dark:text-slate-300">{format(new Date(importSettings.nextImportAt), 'PPpp')}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{importSettings.coverageLabel}</p>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <Users className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>
                Scheduling now lives in Heroku&apos;s Scheduler add-on. This dashboard surfaces the latest fetch results while keeping
                the raw Tradera auctions intact.
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-amber-300" />
                Raw Tradera data
              </CardTitle>
              <CardDescription>Inspect the latest imported auctions without any enrichment applied.</CardDescription>
            </div>
            <Badge variant="secondary">{rawAuctions.length} recent rows</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The table below mirrors the raw payloads coming from Tradera so we can validate fields before enriching them for end
              users.
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-900/80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Ended</TableHead>
                    <TableHead>Raw attributes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawAuctions.map((auction) => (
                    <TableRow key={auction.id}>
                      <TableCell className="font-semibold text-slate-100">{auction.title}</TableCell>
                      <TableCell className="text-slate-300">
                        {auction.finalPrice.toLocaleString('sv-SE', { style: 'currency', currency: auction.currency })}
                      </TableCell>
                      <TableCell className="text-slate-300">{format(new Date(auction.endTime), 'PPpp')}</TableCell>
                      <TableCell>
                        {auction.rawAttributes ? (
                          <div className="space-y-1 text-xs text-slate-300">
                            {Object.entries(auction.rawAttributes)
                              .slice(0, 4)
                              .map(([key, value]) => (
                                <div key={key} className="flex gap-2">
                                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-200">
                                    {key}
                                  </span>
                                  <span className="text-slate-200">{String(Array.isArray(value) ? value.join(', ') : value)}</span>
                                </div>
                              ))}
                            {Object.keys(auction.rawAttributes).length > 4 && (
                              <p className="text-[10px] uppercase tracking-wide text-slate-500">…more</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Not available</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rawAuctions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-300">
                        No auctions have been imported yet.
                      </TableCell>
                    </TableRow>
                  )}
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
              Track how many auctions have been linked to card records without altering the original feed.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                setEnrichmentPending(true)
                setEnrichmentNote(null)
                try {
                  const result = await runEnrichment()
                  setEnrichmentNote(
                    `Enrichment ran: linked ${result.linked ?? 0}, needs review ${result.needsReview ?? 0}, unmatched ${
                      result.unmatched ?? 0
                    }.`
                  )
                  await Promise.all([refetchAuctions(), refetchEnrichment()])
                } catch (error) {
                  console.error('Failed to run enrichment', error)
                  setEnrichmentNote('Enrichment failed to run. Please check the server logs.')
                }
                setEnrichmentPending(false)
              }}
              size="sm"
              className="gap-2"
              disabled={enrichmentPending || isFetching || isFetchingEnrichment}
            >
              <Sparkles className="h-4 w-4" /> {enrichmentPending ? 'Running…' : 'Run enrichment'}
            </Button>
            <Button
              onClick={() => {
                void refetchAuctions()
                void refetchEnrichment()
              }}
              variant="secondary"
              size="sm"
              className="gap-2"
              disabled={isFetching || isFetchingEnrichment}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <p className="text-xs uppercase tracking-wide text-slate-500">Distinct cards</p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {enrichmentSummary?.distinctCards?.toLocaleString('sv-SE') ?? '—'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Unique card records created from enrichment.</p>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-slate-400/60 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <ListChecks className="h-4 w-4" /> Freshness
              </p>
              <p className="mt-1 text-slate-800 dark:text-slate-100">
                Latest fetch: {enrichmentSummary?.lastFetchedAt ? format(new Date(enrichmentSummary.lastFetchedAt), 'PPpp') : '—'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Latest auction end date seen: {enrichmentSummary?.lastEndAt ? format(new Date(enrichmentSummary.lastEndAt), 'PPpp') : '—'}
              </p>
              {!enrichmentSummary?.available && (
                <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">
                  Enrichment metrics are unavailable until the database connection succeeds.
                </p>
              )}
              {enrichmentNote && (
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-200">{enrichmentNote}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
