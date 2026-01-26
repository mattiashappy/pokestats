import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { format, isValid, parseISO, subMonths } from 'date-fns'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { Button } from '../components/ui/button'
import { Card as UiCard, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { fetchCardDetails } from '../lib/api'
import { getCardSetIdentifier } from '../lib/sets'
import type { CardPriceHistoryPoint, CardPriceVariant, CardResponse } from '../types'

type NormalizedHistoryPoint = {
  date: Date
  label: string
  market: number | null
  variants: Record<string, number | null>
}

const rangeOptions = [
  { key: '1M', months: 1 },
  { key: '3M', months: 3 },
  { key: '6M', months: 6 },
  { key: '1Y', months: 12 },
  { key: 'All', months: null }
] as const

function formatUsd(value: number | null | undefined): string {
  if (!Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
}

function getHistoryEntries(card: CardResponse | null | undefined): CardPriceHistoryPoint[] {
  if (!card) return []
  const history =
    card.price_history ??
    card.prices_data?.history ??
    card.prices_data?.price_history ??
    card.prices_data?.market_history ??
    null
  if (Array.isArray(history)) return history
  if (history && typeof history === 'object' && Array.isArray((history as { data?: unknown }).data)) {
    return (history as { data: CardPriceHistoryPoint[] }).data
  }
  return []
}

function normalizeHistoryData(card: CardResponse | null | undefined): NormalizedHistoryPoint[] {
  const raw = getHistoryEntries(card)
  const points = raw
    .map((entry) => {
      const rawDate = entry.date ?? entry.timestamp ?? entry.time ?? entry.created_at
      const date =
        rawDate instanceof Date
          ? rawDate
          : typeof rawDate === 'number'
            ? new Date(rawDate)
            : typeof rawDate === 'string'
              ? parseISO(rawDate)
              : null
      if (!date || !isValid(date)) return null
      const market = Number.isFinite(Number(entry.market ?? entry.price ?? entry.value))
        ? Number(entry.market ?? entry.price ?? entry.value)
        : null
      const variants: Record<string, number | null> = {}
      if (entry.variants && typeof entry.variants === 'object') {
        Object.entries(entry.variants).forEach(([variantName, variantValue]) => {
          if (variantValue && typeof variantValue === 'object') {
            const variantMarket = Number((variantValue as CardPriceVariant).market)
            variants[variantName] = Number.isFinite(variantMarket) ? variantMarket : null
          } else if (Number.isFinite(Number(variantValue))) {
            variants[variantName] = Number(variantValue)
          } else {
            variants[variantName] = null
          }
        })
      }
      return {
        date,
        label: format(date, 'MMM d, yyyy'),
        market,
        variants
      }
    })
    .filter((point): point is NormalizedHistoryPoint => Boolean(point))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return points
}

export function CardPage(): JSX.Element {
  const { id, setCode } = useParams()

  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError
  } = useQuery({
    queryKey: ['card', id],
    queryFn: () => fetchCardDetails(id ?? '', { includeHistory: true }),
    enabled: Boolean(id)
  })

  const headerLabel = useMemo(() => {
    if (!card) return 'Card'
    if (card.card_number) return `${card.name} - ${card.card_number}`
    return card.name
  }, [card])

  const productDetails = useMemo(() => {
    if (!card?.product_details) return []
    return card.product_details
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && !line.toLowerCase().startsWith('last updated:'))
  }, [card?.product_details])

  const typeBadges = useMemo(() => {
    const types = new Set<string>()
    if (card?.pokemon_type) types.add(card.pokemon_type)
    card?.energy_type?.forEach((type) => {
      if (type) types.add(type)
    })
    return Array.from(types)
  }, [card?.pokemon_type, card?.energy_type])

  const statsLabel = useMemo(() => {
    if (!card) return null
    const parts = []
    if (card.stage) parts.push(card.stage)
    if (Number.isFinite(Number(card.hp))) parts.push(`${card.hp} HP`)
    return parts.length ? parts.join(' - ') : null
  }, [card])

  const marketDetails = useMemo(() => {
    if (!card) return null
    const prices = card.prices_data ?? {}
    return {
      market: prices.market ?? card.price_market ?? null,
      low: prices.low ?? null,
      mid: prices.mid ?? null,
      high: prices.high ?? null,
      listings: prices.listings ?? null
    }
  }, [card])

  const variants = useMemo(() => {
    const entries = Object.entries(card?.prices_data?.variants ?? {}).filter(([, value]) => value)
    return entries.map(([name, value]) => ({
      name,
      market: (value as CardPriceVariant | null)?.market ?? null,
      low: (value as CardPriceVariant | null)?.low ?? null,
      mid: (value as CardPriceVariant | null)?.mid ?? null,
      high: (value as CardPriceVariant | null)?.high ?? null
    }))
  }, [card?.prices_data?.variants])

  const [selectedRange, setSelectedRange] = useState<(typeof rangeOptions)[number]['key']>('All')
  const [selectedVariant, setSelectedVariant] = useState<string>('Market')

  const normalizedHistory = useMemo(() => normalizeHistoryData(card), [card])

  const variantOptions = useMemo(() => {
    const names = new Set<string>()
    normalizedHistory.forEach((point) => {
      Object.keys(point.variants).forEach((name) => names.add(name))
    })
    return ['Market', ...Array.from(names)]
  }, [normalizedHistory])

  useEffect(() => {
    if (!variantOptions.includes(selectedVariant)) {
      setSelectedVariant('Market')
    }
  }, [selectedVariant, variantOptions])

  const filteredHistory = useMemo(() => {
    const range = rangeOptions.find((option) => option.key === selectedRange)
    if (!range || !range.months) return normalizedHistory
    const cutoff = subMonths(new Date(), range.months)
    return normalizedHistory.filter((point) => point.date >= cutoff)
  }, [normalizedHistory, selectedRange])

  const chartData = useMemo(() => {
    return filteredHistory.map((point) => ({
      date: point.label,
      value: selectedVariant === 'Market' ? point.market : point.variants[selectedVariant] ?? null
    }))
  }, [filteredHistory, selectedVariant])

  const selectedVariantLabel = variantOptions.includes(selectedVariant) ? selectedVariant : 'Market'

  const isLoading = isLoadingCard
  const error = cardError

  const resolvedSetCode = setCode ?? (card ? getCardSetIdentifier(card) : null)
  const resolvedSetName = card?.set_name || resolvedSetCode
  const backLink = resolvedSetCode ? `/sets/${resolvedSetCode}` : '/sets'
  const backLabel = resolvedSetName ? `Back to ${resolvedSetName}` : 'Back to sets'

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border-4 border-slate-900 bg-amber-200 p-6 shadow-[6px_6px_0px_#0f172a]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Button
            asChild
            size="sm"
            className="h-9 border-2 border-slate-900 bg-white px-4 text-xs font-bold uppercase tracking-wide text-slate-900 shadow-[3px_3px_0px_#0f172a] transition hover:-translate-y-0.5 hover:bg-slate-900 hover:text-white"
          >
            <Link to={backLink}>
              <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
            </Link>
          </Button>
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-[2px_2px_0px_#0f172a]">
            Card details
          </span>
        </div>
        <div className="mt-4 space-y-3">
          <h1 className="text-4xl font-black uppercase text-slate-900">{headerLabel}</h1>
          {statsLabel ? (
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">{statsLabel}</p>
          ) : null}
          {card ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-900">
              <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
                Name: {card.name || 'Unknown name'}
              </span>
              <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
                Era: {card.era || 'Unknown era'}
              </span>
              <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
                Set: {card.set_name || 'Unknown set'}
              </span>
              <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
                Language: {card.language || 'Unknown language'}
              </span>
              <span className="rounded-full border-2 border-slate-900 bg-white px-3 py-1 shadow-[2px_2px_0px_#0f172a]">
                Card number: {card.card_number || 'N/A'}
              </span>
              {typeBadges.length ? (
                <span className="inline-flex flex-wrap gap-2">
                  {typeBadges.map((type) => (
                    <span
                      key={type}
                      className="rounded-full border-2 border-slate-900 bg-amber-50 px-3 py-1 shadow-[2px_2px_0px_#0f172a]"
                    >
                      Type: {type}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {card && !isLoading && !error ? (
        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <div>
            {card.image_url ? (
              <img src={card.image_url} alt={card.name} className="h-auto w-full" />
            ) : (
              <div className="flex h-64 items-center justify-center bg-amber-50 text-sm font-semibold uppercase tracking-wide text-slate-600">
                No image available
              </div>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr),240px]">
            <div className="space-y-6">
              <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
                <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
                  <CardTitle className="text-lg font-black uppercase text-white">Product details</CardTitle>
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Reference data for this specific card.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5 text-sm font-medium text-slate-700">
                  {productDetails.length > 0 ? (
                    <ul className="space-y-2">
                      {productDetails.map((line, index) => (
                        <li
                          key={index}
                          className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-2 leading-relaxed shadow-[2px_2px_0px_#0f172a]"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500">No product details provided.</p>
                  )}
                </CardContent>
              </UiCard>

              <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
                <CardHeader className="border-b-4 border-slate-900 bg-slate-900">
                  <CardTitle className="text-lg font-black uppercase text-white">Flavor text</CardTitle>
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                    Pokédex entry and card lore.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 text-sm font-medium text-slate-700">
                  {card.flavor_text ? (
                    <p className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-4 py-3 leading-relaxed shadow-[2px_2px_0px_#0f172a]">
                      {card.flavor_text}
                    </p>
                  ) : (
                    <p className="text-slate-500">No flavor text available.</p>
                  )}
                </CardContent>
              </UiCard>

              <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
                <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
                  <CardTitle className="text-lg font-black uppercase text-white">Market details</CardTitle>
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                    Latest market pricing and supply.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5 text-sm font-medium text-slate-700">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Market</p>
                      <p className="text-lg font-black text-slate-900">{formatUsd(marketDetails?.market ?? null)}</p>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Low</p>
                      <p className="text-lg font-black text-slate-900">{formatUsd(marketDetails?.low ?? null)}</p>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Mid</p>
                      <p className="text-lg font-black text-slate-900">{formatUsd(marketDetails?.mid ?? null)}</p>
                    </div>
                    <div className="rounded-2xl border-2 border-slate-900 bg-amber-50 px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">High</p>
                      <p className="text-lg font-black text-slate-900">{formatUsd(marketDetails?.high ?? null)}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-900 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-[2px_2px_0px_#0f172a]">
                    Active listings:{' '}
                    <span className="text-base font-black text-slate-900">
                      {marketDetails?.listings != null ? marketDetails.listings.toLocaleString('en-US') : '—'}
                    </span>
                  </div>
                </CardContent>
              </UiCard>

              <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
                <CardHeader className="border-b-4 border-slate-900 bg-slate-900">
                  <CardTitle className="text-lg font-black uppercase text-white">Price history</CardTitle>
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                    Market price trends over time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5 text-sm font-medium text-slate-700">
                  <div className="flex flex-wrap gap-2">
                    {rangeOptions.map((option) => (
                      <Button
                        key={option.key}
                        size="sm"
                        variant={selectedRange === option.key ? 'default' : 'outline'}
                        onClick={() => setSelectedRange(option.key)}
                      >
                        {option.key}
                      </Button>
                    ))}
                  </div>
                  {variantOptions.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {variantOptions.map((option) => (
                        <Button
                          key={option}
                          size="sm"
                          variant={selectedVariantLabel === option ? 'default' : 'outline'}
                          onClick={() => setSelectedVariant(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {chartData.length ? (
                    <div className="h-64 rounded-2xl border-2 border-slate-900 bg-amber-50 p-3 shadow-[2px_2px_0px_#0f172a]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" opacity={0.1} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={8} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(value) => formatUsd(value as number | null)}
                            width={60}
                          />
                          <Tooltip
                            formatter={(value) => formatUsd(value as number | null)}
                            labelClassName="text-xs font-semibold text-slate-700"
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#0f172a"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-slate-500">No price history available yet.</p>
                  )}
                </CardContent>
              </UiCard>

              {variants.length ? (
                <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
                  <CardHeader className="border-b-4 border-slate-900 bg-[#0F172A]">
                    <CardTitle className="text-lg font-black uppercase text-white">Variants</CardTitle>
                    <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                      Compare market pricing across versions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-left">Version</TableHead>
                          <TableHead className="text-right">Market</TableHead>
                          <TableHead className="text-right">Low</TableHead>
                          <TableHead className="text-right">Mid</TableHead>
                          <TableHead className="text-right">High</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variants.map((variant) => (
                          <TableRow key={variant.name}>
                            <TableCell className="font-semibold text-slate-900">{variant.name}</TableCell>
                            <TableCell className="text-right">{formatUsd(variant.market)}</TableCell>
                            <TableCell className="text-right">{formatUsd(variant.low)}</TableCell>
                            <TableCell className="text-right">{formatUsd(variant.mid)}</TableCell>
                            <TableCell className="text-right">{formatUsd(variant.high)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </UiCard>
              ) : null}
            </div>

            <UiCard className="border-4 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a]">
              <CardHeader className="border-b-4 border-slate-900 bg-slate-900">
                <CardTitle className="text-lg font-black uppercase text-white">Highlights</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                  Quick facts at a glance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4 text-xs font-semibold uppercase text-slate-900">
                <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                  Era
                  <div className="text-base font-black">{card.era || 'Unknown era'}</div>
                </div>
                <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                  Set
                  <div className="text-base font-black">{card.set_name || 'Unknown set'}</div>
                </div>
                <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                  Language
                  <div className="text-base font-black">{card.language || 'Unknown language'}</div>
                </div>
                <div className="rounded-2xl border-2 border-slate-900 bg-white px-3 py-3 shadow-[2px_2px_0px_#0f172a]">
                  Card #
                  <div className="text-base font-black">{card.card_number || 'N/A'}</div>
                </div>
              </CardContent>
            </UiCard>
          </div>
        </div>
      ) : null}

    </div>
  )
}
