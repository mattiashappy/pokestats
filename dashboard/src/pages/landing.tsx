import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Layers, LineChart, Link2, ShieldCheck, Sparkles, Table2 } from 'lucide-react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { fetchCardsPreview, fetchExpansions } from '../lib/api'
import { getCardSetIdentifier, getExpansionIdentifier } from '../lib/sets'
import type { CardListItem, ExpansionSummary } from '../types'

export function LandingPage(): JSX.Element {
  const { data: expansions = [] } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions'],
    queryFn: fetchExpansions
  })

  const { data: previewCards = [] } = useQuery<CardListItem[]>({
    queryKey: ['cards-preview-landing'],
    queryFn: () => fetchCardsPreview(6),
    staleTime: 1000 * 60
  })

  const latestSets = useMemo(() => {
    if (!expansions.length) return []
    return [...expansions]
      .sort((a, b) => {
        const dateA = a.release_date ? new Date(a.release_date).getTime() : 0
        const dateB = b.release_date ? new Date(b.release_date).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 4)
  }, [expansions])

  const featuredCards = useMemo(() => previewCards.slice(0, 4), [previewCards])

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-sky-200">
            <Sparkles className="h-4 w-4" />
            PokéStats · Tradera feed live
          </div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">See Pokémon sets and cards without any setup.</h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            Tradera data is already imported, so prospects land on real listings plus the latest sets and cards. Start with a 14-day
            trial that rolls into $7/mo once you keep access.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup" className="inline-flex items-center gap-2">
                Try free for 14 days
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>App shell</CardTitle>
              <CardDescription>Sidebar navigation, protected routes, and SPA routing ready for Heroku.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 dark:text-slate-300">Shadcn/ui styling with Tailwind tokens for a SaaS look.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Trial + billing</CardTitle>
              <CardDescription>Stripe-ready code paths with card capture and a 14-day trial.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 dark:text-slate-300">
              Start with a free trial, then roll into $7/mo unless you cancel.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Set-ready catalog</CardTitle>
              <CardDescription>New sets and card pages stay synced as data lands.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600 dark:text-slate-300">
              React Query pulls expansions and card previews straight from the live catalog.
            </CardContent>
          </Card>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle>Newest sets</CardTitle>
              <CardDescription>Jump straight into the newest expansions in the catalog.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {latestSets.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">Loading set previews…</p>
              ) : (
                <ul className="space-y-2">
                  {latestSets.map((set) => (
                    <li key={set.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{set.name ?? 'Untitled set'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {set.release_date ? new Date(set.release_date).toLocaleDateString('sv-SE') : 'Release date pending'}
                        </p>
                      </div>
                      <Link
                        className="text-xs font-semibold uppercase tracking-wide text-sky-600 hover:text-sky-700"
                        to={`/sets/${getExpansionIdentifier(set)}`}
                      >
                        View cards
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle>Featured cards</CardTitle>
              <CardDescription>Recently indexed cards, ready for auction matching.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {featuredCards.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">Loading card previews…</p>
              ) : (
                <ul className="space-y-2">
                  {featuredCards.map((card) => {
                    const setIdentifier = getCardSetIdentifier(card)
                    return (
                      <li key={card.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{card.name ?? 'Unknown card'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {[card.set_name ?? card.set_code, card.card_number].filter(Boolean).join(' · ') || 'Set details pending'}
                          </p>
                        </div>
                        <Link
                          className="text-xs font-semibold uppercase tracking-wide text-sky-600 hover:text-sky-700"
                          to={setIdentifier ? `/sets/${setIdentifier}/${card.id}` : `/cards/${card.id}`}
                        >
                          Open card
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-8 rounded-2xl border border-slate-200 bg-white/60 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
          <div className="space-y-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-200">Core data strategy</p>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Auctions → Cards → Market intelligence</h2>
            <p className="text-base text-slate-600 dark:text-slate-300">
              Raw Tradera auctions stay transparent while canonical card pages turn noisy seller listings into structured market intelligence.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="rounded-lg bg-sky-100 p-2 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200">
                  <Table2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Auction table</CardTitle>
                  <CardDescription>Ended Tradera auctions remain fully visible for transparency and discovery.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Columns</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  <li className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/70">Picture + title from the original listing</li>
                  <li className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/70">Era classification derived from multiple signals</li>
                  <li className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/70">Final price and total bids</li>
                  <li className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/70">Ended timestamp with a direct Tradera link</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Card-centric navigation</CardTitle>
                  <CardDescription>Picture and title clicks always route to a canonical card page.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Card page shows</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>All historical ended auctions that match the card—even if sellers mislabeled titles.</li>
                  <li>Aggregated pricing stats, demand signals, and sell-through behavior.</li>
                  <li>Price distribution over time for true market intelligence.</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Reduced noise</CardTitle>
                  <CardDescription>Linking auctions to cards eliminates fragmented spellings or marketing fluff.</CardDescription>
                </div>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
                  <LineChart className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Market insight</CardTitle>
                  <CardDescription>Analyze volatility, demand consistency, and era-level performance at the card level.</CardDescription>
                </div>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="rounded-lg bg-rose-100 p-2 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Premium-ready</CardTitle>
                  <CardDescription>Era trends, volatility metrics, and strategy insights build on the card grouping.</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col items-center gap-3">
            <ShieldCheck className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">SPA routing resilient to Heroku refreshes.</p>
            <p className="max-w-3xl text-slate-600 dark:text-slate-400">
              Express serves the Vite build with a catch-all fallback, plus a health endpoint for uptime checks.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
