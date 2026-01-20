import { useMemo } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { Shield } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { registeredUsers } from '../data/users'

export function AdminPage(): JSX.Element {
  const totals = useMemo(() => {
    return registeredUsers.reduce(
      (acc, user) => {
        if (user.subscriptionStatus === 'active') acc.paid += 1
        if (user.subscriptionStatus === 'trialing') acc.trialing += 1
        if (user.subscriptionStatus === 'inactive') acc.inactive += 1
        acc.total += 1
        acc.totalCards += user.collection.totalCards
        acc.totalValue += user.collection.estimatedValue
        return acc
      },
      { paid: 0, inactive: 0, trialing: 0, total: 0, totalCards: 0, totalValue: 0 }
    )
  }, [])

  const currencyFormatter = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">User registration control center</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Admin access is stored in Config Vars. Track registered users, billing status, and collection activity in one place.
          </p>
        </div>
        <Badge variant="secondary" className="inline-flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Restricted area
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registration overview</CardTitle>
            <CardDescription>All customer accounts created through signup and their current billing states.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-xs uppercase tracking-wide text-slate-500">Registered users</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{totals.total}</p>
              <p className="text-xs text-slate-500">Signup enabled</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-xs uppercase tracking-wide text-slate-500">Paid members</p>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-200">{totals.paid}</p>
              <p className="text-xs text-slate-500">Monthly or annual</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-xs uppercase tracking-wide text-slate-500">Trials running</p>
              <p className="text-2xl font-semibold text-sky-600 dark:text-sky-200">{totals.trialing}</p>
              <p className="text-xs text-slate-500">Awaiting conversion</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-xs uppercase tracking-wide text-slate-500">Inactive</p>
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-200">{totals.inactive}</p>
              <p className="text-xs text-slate-500">Needs payment</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collections connected</CardTitle>
            <CardDescription>Keep tabs on the card inventory each user is building inside PokéStats.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-xs uppercase tracking-wide text-slate-500">Cards tracked</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{totals.totalCards}</p>
              <p className="text-xs text-slate-500">Across all collections</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-xs uppercase tracking-wide text-slate-500">Estimated value</p>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-200">
                {currencyFormatter.format(totals.totalValue)}
              </p>
              <p className="text-xs text-slate-500">Collections in sync</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>Registered users</CardTitle>
            <CardDescription>Customer list with billing status and collection metadata.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center">
            <Badge variant="success">{registeredUsers.length} users</Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-900/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Name</TableHead>
                  <TableHead className="text-left">Email</TableHead>
                  <TableHead className="text-left">Billing status</TableHead>
                  <TableHead className="text-left">Plan</TableHead>
                  <TableHead className="text-left">Trial / renewal</TableHead>
                  <TableHead className="text-left">Collection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registeredUsers.map((user) => {
                  const trialDaysLeft = user.trialEndsAt
                    ? Math.max(0, differenceInCalendarDays(new Date(user.trialEndsAt), new Date()))
                    : null

                  const trialCopy = user.trialEndsAt
                    ? `${format(new Date(user.trialEndsAt), 'PPP')} (${trialDaysLeft}d left)`
                    : user.lastPaymentAt
                      ? `Paid on ${format(new Date(user.lastPaymentAt), 'PPP')}`
                      : '—'

                  return (
                    <TableRow key={user.email}>
                      <TableCell className="text-left font-semibold text-slate-900 dark:text-slate-50">{user.name}</TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">{user.email}</TableCell>
                      <TableCell className="text-left">
                        <Badge
                          variant={
                            user.subscriptionStatus === 'active'
                              ? 'success'
                              : user.subscriptionStatus === 'trialing'
                                ? 'secondary'
                                : 'warning'
                          }
                        >
                          {user.subscriptionStatus === 'active'
                            ? 'Paid'
                            : user.subscriptionStatus === 'trialing'
                              ? 'Trialing'
                              : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-left capitalize text-slate-600 dark:text-slate-300">
                        {user.billingPlan === 'none' ? 'No plan' : user.billingPlan}
                      </TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">{trialCopy}</TableCell>
                      <TableCell className="text-left text-slate-600 dark:text-slate-300">
                        <div className="font-semibold text-slate-900 dark:text-slate-50">{user.collection.name}</div>
                        <div className="text-xs text-slate-500">
                          {user.collection.totalCards} cards • {user.collection.uniqueCards} unique •{' '}
                          {currencyFormatter.format(user.collection.estimatedValue)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
