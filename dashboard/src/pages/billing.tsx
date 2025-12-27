import { useMemo } from 'react'
import { CreditCard, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useAuth } from '../providers/auth'

export function BillingPage(): JSX.Element {
  const { user, updateSubscription } = useAuth()

  const statusCopy = useMemo(() => {
    if (user?.subscriptionStatus === 'active') {
      return {
        tone: 'active',
        title: 'Subscription active',
        description: 'You have full access to the dashboard. Webhooks can flip this on/off later.'
      }
    }
    return {
      tone: 'inactive',
      title: 'Subscription inactive',
      description: 'Start a Stripe subscription to unlock importer-driven analytics.'
    }
  }, [user?.subscriptionStatus])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing</p>
          <h1 className="text-3xl font-bold text-slate-50">Subscription</h1>
          <p className="text-sm text-slate-400">Mocked Stripe flow with a state toggle for now.</p>
        </div>
        <Badge variant={user?.subscriptionStatus === 'active' ? 'success' : 'warning'} className="uppercase">
          {user?.subscriptionStatus ?? 'unknown'}
        </Badge>
      </div>

      <Card className="bg-slate-900/70">
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
              onClick={() => updateSubscription(user?.subscriptionStatus === 'active' ? 'inactive' : 'active')}
            >
              {user?.subscriptionStatus === 'active' ? 'Pause billing' : 'Start subscription'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-amber-300" />
            <p>Stripe checkout + customer portal can be connected to this button once keys are available.</p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
            <p>Route protection automatically redirects inactive accounts here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
