import { useMemo, useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { AlertCircle, CreditCard, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { useAuth } from '../providers/auth'
import { registeredUsers } from '../data/users'

export function BillingPage(): JSX.Element {
  const { user, updateSubscription, startTrial } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [expiry, setExpiry] = useState('12/28')
  const [cvc, setCvc] = useState('123')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  if (isAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Admin billing overview</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Admin accounts are comped and do not require payment. Use this view to keep tabs on everyone else&apos;s billing status.
            </p>
          </div>
          <Badge variant="secondary" className="uppercase">Comped admin</Badge>
        </div>

        <Card className="bg-slate-900/70">
          <CardHeader>
            <CardTitle>Personal billing disabled</CardTitle>
            <CardDescription>Because this admin seat is free, the subscription controls are hidden.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>Access to the dashboard and admin area stays unlocked with no renewal required.</p>
            </div>
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 text-amber-300" />
              <p>Use the Admin section to reschedule imports and manage platform-wide settings.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Tenant billing roster</CardTitle>
              <CardDescription>Everyone using PokéStats and their current billing arrangement.</CardDescription>
            </div>
            <Badge variant="secondary">{registeredUsers.length} accounts</Badge>
          </CardHeader>
          <CardContent className="overflow-hidden rounded-xl border border-slate-900/80 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Trial / renewal</TableHead>
                  <TableHead>Collection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registeredUsers.map((account) => (
                  <TableRow key={account.email}>
                    <TableCell className="font-semibold text-slate-900 dark:text-slate-100">{account.name}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{account.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          account.subscriptionStatus === 'active'
                            ? 'success'
                            : account.subscriptionStatus === 'trialing'
                              ? 'secondary'
                              : 'warning'
                        }
                      >
                        {account.subscriptionStatus === 'active'
                          ? 'Paid'
                          : account.subscriptionStatus === 'trialing'
                            ? 'Trialing'
                            : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{account.billingPlan === 'none' ? 'No plan' : account.billingPlan}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      {account.trialEndsAt
                        ? `Trial ends ${format(new Date(account.trialEndsAt), 'PPP')}`
                        : account.lastPaymentAt
                          ? `Paid on ${format(new Date(account.lastPaymentAt), 'PPP')}`
                          : '—'}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      {account.collection.totalCards} cards ({account.collection.uniqueCards} unique)
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  }

  const daysLeftInTrial = useMemo(() => {
    if (!user?.trialEndsAt) return null
    const remaining = differenceInCalendarDays(new Date(user.trialEndsAt), new Date())
    return remaining < 0 ? 0 : remaining
  }, [user?.trialEndsAt])

  const statusCopy = useMemo(() => {
    if (user?.subscriptionStatus === 'active') {
      return {
        tone: 'active',
        title: 'Subscription active',
        description: 'You have full access to the dashboard. Billing renews at $7/mo.'
      }
    }

    if (user?.subscriptionStatus === 'trialing') {
      return {
        tone: 'trial',
        title: daysLeftInTrial ? `Trial running — ${daysLeftInTrial} days left` : 'Trial converting to paid',
        description: `Your 14-day trial is set. We will convert to $7/mo on ${user.trialEndsAt ? format(new Date(user.trialEndsAt), 'PPP') : 'day 15'}.`
      }
    }
    return {
      tone: 'inactive',
      title: 'Subscription inactive',
      description: 'Start a 14-day trial to unlock the dashboard. Card required to begin.'
    }
  }, [daysLeftInTrial, user?.subscriptionStatus, user?.trialEndsAt])

  const handleStartTrial = (): void => {
    setError('')
    setStatusMessage('')

    const digitsOnly = cardNumber.replace(/\D/g, '')
    const last4 = digitsOnly.slice(-4)

    if (digitsOnly.length < 12 || last4.length < 4 || !expiry || !cvc) {
      setError('Add a full card number, expiry, and CVC to start the trial.')
      return
    }

    void startTrial(last4)
    setStatusMessage('Trial started. Access stays open for 14 days before the $7/mo charge kicks in.')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Subscription</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Cards are required to unlock the 14-day trial. $7/mo afterward.</p>
        </div>
        <Badge
          variant={
            user?.subscriptionStatus === 'active'
              ? 'success'
              : user?.subscriptionStatus === 'trialing'
                ? 'secondary'
                : 'warning'
          }
          className="uppercase"
        >
          {user?.subscriptionStatus ?? 'unknown'}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-sky-300" />
              {statusCopy.title}
            </CardTitle>
            <CardDescription>{statusCopy.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" />
              Manage subscription
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void updateSubscription(user?.subscriptionStatus === 'active' ? 'inactive' : 'active')
              }}
            >
              {user?.subscriptionStatus === 'active' ? 'Pause billing' : 'Activate now ($7/mo)'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-amber-300" />
            <p>Stripe checkout + customer portal can be connected to the buttons once keys are available.</p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
            <p>Route protection automatically redirects inactive accounts here.</p>
          </div>
          {user?.cardLast4 ? (
            <div className="flex items-start gap-3">
              <CreditCard className="mt-0.5 h-4 w-4 text-sky-300" />
              <p>Card •••• {user.cardLast4} will be charged $7/mo after the trial unless you pause.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start a 14-day trial</CardTitle>
          <CardDescription>Unlock Tradera auction insights immediately. $7/mo begins when the trial ends.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}
          {statusMessage ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              <span>{statusMessage}</span>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Card number</span>
              <Input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} placeholder="4242 4242 4242 4242" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Expiry</span>
                <Input value={expiry} onChange={(event) => setExpiry(event.target.value)} placeholder="MM/YY" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">CVC</span>
                <Input value={cvc} onChange={(event) => setCvc(event.target.value)} placeholder="123" />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
            <span>Trial auto-converts to paid on day 15. Cancel any time before then.</span>
            {user?.trialEndsAt ? (
              <Badge variant="secondary">Trial ends {format(new Date(user.trialEndsAt), 'PPP')}</Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleStartTrial}>Start 14-day trial</Button>
            <Button
              variant="outline"
              onClick={() => {
                void updateSubscription('inactive')
              }}
            >
              Pause billing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
