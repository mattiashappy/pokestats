import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Shield, Sparkles } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { registeredUsers } from '../data/users'
import { fetchEnrichmentSummary, fetchUnmatchedAuctions, runEnrichment } from '../lib/api'
import type { EnrichmentSummary, UnmatchedAuction } from '../lib/api'

export function AdminPage(): JSX.Element {
  const {
    data: enrichmentSummary,
    refetch: refetchEnrichment,
    isFetching: isFetchingEnrichment
  } = useQuery<EnrichmentSummary>({ queryKey: ['enrichment-summary'], queryFn: fetchEnrichmentSummary })
  const {
    data: unmatched,
    refetch: refetchUnmatched,
    isFetching: isFetchingUnmatched
  } = useQuery<UnmatchedAuction[]>({ queryKey: ['enrichment-unmatched'], queryFn: () => fetchUnmatchedAuctions(25) })
  const [enrichmentRunResult, setEnrichmentRunResult] = useState<string | null>(null)
  const [enrichmentRunPending, setEnrichmentRunPending] = useState(false)

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
                    <TableHead>Ended</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Set guess</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(unmatched ?? []).map((row) => (
                    <TableRow key={row.item_id}>
                      <TableCell className="text-slate-300">{format(new Date(row.end_date), 'PP')}</TableCell>
                      <TableCell className="font-medium text-slate-100">{row.title}</TableCell>
                      <TableCell className="text-slate-300">{row.parsed_set_guess ?? '—'}</TableCell>
                      <TableCell className="text-slate-300">{row.parsed_number_text ?? '—'}</TableCell>
                      <TableCell className="text-slate-300">{row.enrich_status ?? '—'}</TableCell>
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
