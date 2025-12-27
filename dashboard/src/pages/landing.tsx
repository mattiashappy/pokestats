import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export function LandingPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
            <Sparkles className="h-4 w-4" />
            PokéStats importer-ready SaaS
          </div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            Visualize Pokémon sales before wiring the importer.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-300">
            Dashboard-first scaffolding with auth, subscription gating, and data visual shells ready for Stripe + PostgreSQL once the
            importer lands.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup" className="inline-flex items-center gap-2">
                Start subscription
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-slate-900/70">
            <CardHeader>
              <CardTitle>App shell</CardTitle>
              <CardDescription>Sidebar navigation, protected routes, and SPA routing ready for Heroku.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">Shadcn/ui styling with Tailwind tokens for a SaaS look.</CardContent>
          </Card>
          <Card className="bg-slate-900/70">
            <CardHeader>
              <CardTitle>Mocked billing</CardTitle>
              <CardDescription>Stripe-ready code paths with status badges and CTA states.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">
              Toggle subscription state locally to preview the gating experience.
            </CardContent>
          </Card>
          <Card className="bg-slate-900/70">
            <CardHeader>
              <CardTitle>Future-proof</CardTitle>
              <CardDescription>API placeholders for importer-driven sales data.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">React Query wired to /api/sales with mocked payloads.</CardContent>
          </Card>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <ShieldCheck className="h-10 w-10 text-emerald-400" />
            <p className="text-lg font-semibold text-slate-100">SPA routing resilient to Heroku refreshes.</p>
            <p className="max-w-3xl text-slate-400">
              Express serves the Vite build with a catch-all fallback, plus a health endpoint for uptime checks.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
