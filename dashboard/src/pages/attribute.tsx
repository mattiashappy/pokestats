import { useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Loader2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { useAdminSettings } from '../providers/admin-settings'
import { fetchAuctions } from '../lib/api'
import type { AuctionRecord } from '../types'

const attributeConfigs = {
  era: {
    title: 'Era breakdown',
    label: 'Era',
    description: 'Auction count by Pokémon TCG era.',
    fallback: 'Unknown era',
    selector: (auction: AuctionRecord) => auction.cardEra
  },
  language: {
    title: 'Languages',
    label: 'Language',
    description: 'Listing language breakdown across auctions.',
    fallback: 'Unknown language',
    selector: (auction: AuctionRecord) => auction.language
  }
} satisfies Record<string, {
  title: string
  label: string
  description: string
  fallback: string
  selector: (auction: AuctionRecord) => string | null | undefined
}>

type AttributeId = keyof typeof attributeConfigs

type AttributeStat = { label: string; count: number }

const buildDistribution = (
  data: AuctionRecord[] | undefined,
  selector: (auction: AuctionRecord) => string | null | undefined,
  fallback: string
): AttributeStat[] => {
  if (!data?.length) return []

  const counts = data.reduce((acc, auction) => {
    const key = selector(auction) || fallback
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

export function AttributePage(): JSX.Element {
  const { attributeId } = useParams<{ attributeId: AttributeId }>()
  const { importSettings } = useAdminSettings()
  const { data, isLoading, error } = useQuery<AuctionRecord[]>({ queryKey: ['auctions'], queryFn: fetchAuctions })

  const attribute = attributeId ? attributeConfigs[attributeId] : undefined

  if (!attribute) {
    return <Navigate to="/app/auctions" replace />
  }

  const lastUpdatedLabel = useMemo(() => {
    if (!importSettings?.lastImportAt) return null
    const lastRun = new Date(importSettings.lastImportAt).toLocaleString()
    const coverage = new Date(importSettings.coverageStart).toLocaleDateString()
    return `Data last updated: ${lastRun} (ended auctions from ${coverage})`
  }, [importSettings])

  const totalAuctions = data?.length ?? 0
  const distribution = useMemo(
    () => buildDistribution(data, attribute.selector, attribute.fallback),
    [attribute.fallback, attribute.selector, data]
  )
  const topEntry = distribution[0]

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-slate-900/70 dark:bg-slate-950/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attributes</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{attribute.title}</h1>
            <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">{attribute.description}</p>
          </div>
          {lastUpdatedLabel ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-900/70 dark:bg-slate-900/60 dark:text-slate-300">
              <CalendarClock className="h-4 w-4 text-sky-600 dark:text-sky-300" />
              <span>{lastUpdatedLabel}</span>
            </div>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-1 border-b border-slate-200/70 pb-4 dark:border-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{attribute.label}</p>
          <CardTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{attribute.title}</CardTitle>
          <CardDescription>
            {totalAuctions.toLocaleString('sv-SE')} auctions loaded{topEntry ? ` — top: ${topEntry.label}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading auctions…
            </div>
          ) : error ? (
            <p className="text-sm text-rose-400">Failed to load auctions. Ensure the Express server is running.</p>
          ) : distribution.length ? (
            distribution.map((item) => {
              const percent = totalAuctions ? Math.round((item.count / totalAuctions) * 100) : 0
              return (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200/60 bg-white/70 p-3 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-slate-50">
                    <span className="truncate" title={item.label}>
                      {item.label}
                    </span>
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {item.count.toLocaleString('sv-SE')} ({percent}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-sky-500/80 transition-all dark:bg-sky-400/80"
                      style={{ width: `${percent}%` }}
                      aria-label={`${percent}% of auctions`}
                    />
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No data available for this attribute.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
