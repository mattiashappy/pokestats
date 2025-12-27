import { ArrowUpRight, BarChart3, Clock3, ShieldCheck, Zap } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

const velocityData = [
  { day: 'Mon', sales: 12 },
  { day: 'Tue', sales: 18 },
  { day: 'Wed', sales: 25 },
  { day: 'Thu', sales: 22 },
  { day: 'Fri', sales: 30 },
  { day: 'Sat', sales: 28 },
  { day: 'Sun', sales: 32 }
]

export function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dashboard</p>
          <h1 className="text-3xl font-bold text-slate-50">PokéStats overview</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            SaaS skeleton with metrics, charts, and nav backed by pre-imported Tradera auctions so stakeholders see live-looking
            data on day one.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm">
            <Clock3 className="mr-2 h-4 w-4" />
            Sync later
          </Button>
          <Button size="sm">
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Launch app
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex items-center justify-between space-y-0 pb-3">
            <div>
              <CardDescription>Mock MRR</CardDescription>
              <CardTitle className="text-2xl">€4,980</CardTitle>
            </div>
            <Badge variant="success">+12% vs last week</Badge>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">Stripe hooks can replace this placeholder callout.</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between space-y-0 pb-3">
            <div>
              <CardDescription>Active seats</CardDescription>
              <CardTitle className="text-2xl">128</CardTitle>
            </div>
            <Badge variant="secondary">3 teams</Badge>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">User records will live in Postgres once the real auth layer lands.</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between space-y-0 pb-3">
            <div>
              <CardDescription>Uptime</CardDescription>
              <CardTitle className="text-2xl">99.9%</CardTitle>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
          </CardHeader>
          <CardContent className="text-sm text-slate-300">Health endpoint exposed at /api/health for readiness checks.</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Weekly sales velocity</CardTitle>
              <CardDescription>Mock area chart to visualize the auction volume trend.</CardDescription>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              React Query ready
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={velocityData} margin={{ left: 0, right: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1f2937' }} />
                <Area type="monotone" dataKey="sales" stroke="#38bdf8" fill="#0ea5e9" fillOpacity={0.25} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
          <CardTitle>Next steps</CardTitle>
          <CardDescription>Deploy to Heroku; Stripe + webhook wiring can follow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <Zap className="mt-0.5 h-4 w-4 text-amber-300" />
              <p>Trigger a build, verify /api/health returns ok on the new dyno.</p>
            </div>
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 text-slate-300" />
              <p>Swap the mocked /api/sales payload for the live Tradera feed when ready.</p>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
              <p>Connect Stripe webhooks to flip subscriptionStatus to active server-side.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
