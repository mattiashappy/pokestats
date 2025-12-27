import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowUpDown, CalendarClock, ExternalLink, Loader2, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../components/ui/chart'
import type { AuctionRecord } from '../types'
import { fetchAuctions } from '../lib/api'
import { useAdminSettings } from '../providers/admin-settings'

const sortOptions = [
  { label: 'Ended most recently', value: 'endDesc' },
  { label: 'Highest final price', value: 'priceDesc' },
  { label: 'Most bids', value: 'bidsDesc' }
]

export function AuctionsPage(): JSX.Element {
  const { data, isLoading, error } = useQuery<AuctionRecord[]>({ queryKey: ['auctions'], queryFn: fetchAuctions })
  const { importSettings } = useAdminSettings()

  const [era, setEra] = useState<string>('all')
  const [language, setLanguage] = useState<string>('all')
  const [gradingCompany, setGradingCompany] = useState<string>('all')
  const [grade, setGrade] = useState<string>('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortBy, setSortBy] = useState<string>('endDesc')

  const eras = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.cardEra || 'Unknown era') ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const languages = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.language || 'Unknown language') ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const gradingCompanies = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.gradingCompany || 'Ungraded') ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const grades = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.grade || 'Not graded') ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }),
    []
  )

  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        totalSales: 0,
        totalBids: 0,
        averagePrice: 0,
        averageBids: 0,
        highestSale: 0
      }
    }

    const aggregates = data.reduce(
      (acc, auction) => {
        return {
          totalSales: acc.totalSales + auction.finalPrice,
          totalBids: acc.totalBids + auction.bids,
          highestSale: Math.max(acc.highestSale, auction.finalPrice)
        }
      },
      { totalSales: 0, totalBids: 0, highestSale: 0 }
    )

    return {
      totalSales: aggregates.totalSales,
      totalBids: aggregates.totalBids,
      averagePrice: aggregates.totalSales / data.length,
      averageBids: aggregates.totalBids / data.length,
      highestSale: aggregates.highestSale
    }
  }, [data])

  const eraRadarData = useMemo(() => {
    if (!data?.length) return []

    const eraTotals = data.reduce((acc, auction) => {
      const key = auction.cardEra || 'Unknown era'
      const current = acc.get(key) ?? { total: 0, count: 0 }

      current.total += auction.finalPrice
      current.count += 1

      acc.set(key, current)
      return acc
    }, new Map<string, { total: number; count: number }>())

    return Array.from(eraTotals.entries())
      .map(([era, values]) => ({
        era,
        averageSale: values.total / values.count,
        auctionCount: values.count
      }))
      .sort((a, b) => b.averageSale - a.averageSale)
      .slice(0, 8)
  }, [data])

  const eraChartConfig = useMemo<ChartConfig>(
    () => ({
      averageSale: {
        label: 'Avg. final price',
        color: 'hsl(var(--chart-1))'
      }
    }),
    []
  )

  const filteredAndSorted = useMemo(() => {
    if (!data) return []

    const filtered = data.filter((auction) => {
      const matchesPriceMin = minPrice ? auction.finalPrice >= Number(minPrice) : true
      const matchesPriceMax = maxPrice ? auction.finalPrice <= Number(maxPrice) : true
      const matchesEra = era === 'all' || (auction.cardEra || 'Unknown era') === era
      const matchesLanguage = language === 'all' || (auction.language || 'Unknown language') === language
      const matchesGradingCompany =
        gradingCompany === 'all' || (auction.gradingCompany || 'Ungraded') === gradingCompany
      const matchesGrade = grade === 'all' || (auction.grade || 'Not graded') === grade

      return (
        matchesPriceMin &&
        matchesPriceMax &&
        matchesEra &&
        matchesLanguage &&
        matchesGradingCompany &&
        matchesGrade
      )
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'priceDesc') return b.finalPrice - a.finalPrice
      if (sortBy === 'bidsDesc') return b.bids - a.bids
      return new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
    })
  }, [
    data,
    maxPrice,
    minPrice,
    era,
    language,
    gradingCompany,
    grade,
    sortBy
  ])

  const lastUpdatedLabel = useMemo(() => {
    if (!importSettings?.lastImportAt) return null
    const lastRun = format(new Date(importSettings.lastImportAt), 'LLL d, HH:mm')
    const coverage = format(new Date(importSettings.coverageStart), 'PPP')
    return `Data last updated: ${lastRun} (ended auctions from ${coverage})`
  }, [importSettings])

  const auctionsCount = data?.length ?? 0
  const topEra = eraRadarData[0]

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-slate-900/70 dark:bg-slate-950/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auctions</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Tradera ended auctions</h1>
            <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Browse and filter ended Tradera auctions imported after completion. Live auctions are not tracked.
            </p>
          </div>
          {lastUpdatedLabel ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-900/70 dark:bg-slate-900/60 dark:text-slate-300">
              <CalendarClock className="h-4 w-4 text-sky-600 dark:text-sky-300" />
              <span>{lastUpdatedLabel}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-slate-200/60 bg-white/60 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auctions</p>
              <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                {auctionsCount.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-500">{filteredAndSorted.length.toLocaleString('sv-SE')} in view after filters</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 bg-white/60 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total sales</p>
              <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                {currencyFormatter.format(stats.totalSales)}
              </p>
              <p className="text-xs text-slate-500">Archive-wide sales volume</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 bg-white/60 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total bids</p>
              <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                {stats.totalBids.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-500">Avg. {stats.averageBids.toFixed(1)} bids per auction</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 bg-white/60 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average sale</p>
              <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                {currencyFormatter.format(stats.averagePrice || 0)}
              </p>
              <p className="text-xs text-slate-500">Median-like feel for quick sizing</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 bg-white/60 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top sale</p>
              <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                {currencyFormatter.format(stats.highestSale || 0)}
              </p>
              <p className="text-xs text-slate-500">Highest realized price in the archive</p>
            </CardContent>
          </Card>

        </div>
      </div>
      {eraRadarData.length ? (
        <Card>
          <CardHeader className="space-y-4 border-b border-slate-200/70 pb-4 dark:border-slate-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attributes</p>
                <CardTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Era averages</CardTitle>
                <CardDescription>
                  Average final price by era for the loaded auctions (top 8 eras shown).
                </CardDescription>
              </div>
              {topEra ? (
                <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-right shadow-sm dark:border-slate-900/70 dark:bg-slate-900/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top era</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{topEra.era}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {currencyFormatter.format(topEra.averageSale)} avg sale
                  </p>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pb-0">
            <ChartContainer config={eraChartConfig} className="mx-auto aspect-square max-h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={eraRadarData}
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  outerRadius="80%"
                >
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <PolarAngleAxis dataKey="era" tick={{ fontSize: 10 }} />
                  <PolarGrid />
                  <Radar
                    dataKey="averageSale"
                    fill="var(--color-averageSale)"
                    fillOpacity={0.65}
                    stroke="var(--color-averageSale)"
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-50">
              <TrendingUp className="h-4 w-4 text-sky-500" />
              Snapshot of average final prices by era ({eraRadarData.length} eras shown)
            </div>
            <div className="text-xs">Hover each spoke to explore exact values and compare eras.</div>
          </CardFooter>
        </Card>
      ) : null}
      <Card>
        <CardHeader className="space-y-4 border-b border-slate-200/70 pb-4 dark:border-slate-900/70">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auction archive</p>
              <CardTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Ended auctions</CardTitle>
              <CardDescription>Filter the archive directly from the list with lightweight chips.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-700 dark:text-slate-300"
              onClick={() => {
                setEra('all')
                setLanguage('all')
                setGradingCompany('all')
                setGrade('all')
                setMinPrice('')
                setMaxPrice('')
                setSortBy('endDesc')
              }}
            >
              Reset
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-sm dark:border-slate-900/70 dark:bg-slate-950/50">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-900/70 dark:text-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Era</span>
              <Select
                value={era}
                onChange={(event) => setEra(event.target.value)}
                className="h-9 w-36 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {eras.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All eras' : option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-900/70 dark:text-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Language</span>
              <Select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="h-9 w-40 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {languages.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All languages' : option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-900/70 dark:text-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Grading co.</span>
              <Select
                value={gradingCompany}
                onChange={(event) => setGradingCompany(event.target.value)}
                className="h-9 w-44 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {gradingCompanies.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All companies' : option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-900/70 dark:text-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Grade</span>
              <Select
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                className="h-9 w-28 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {grades.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All grades' : option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-900/70 dark:text-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Price</span>
              <Input
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="Min"
                inputMode="numeric"
                className="h-9 w-20 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <span className="text-xs text-slate-400">–</span>
              <Input
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Max"
                inputMode="numeric"
                className="h-9 w-20 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-900 dark:bg-slate-900/70 dark:text-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sort</span>
              <Select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="h-9 w-44 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900/60 dark:text-slate-200">
              <ArrowUpDown className="h-4 w-4" /> {sortOptions.find((option) => option.value === sortBy)?.label}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 shadow-sm dark:bg-slate-900/60 dark:text-slate-200">
              {filteredAndSorted.length.toLocaleString('sv-SE')} auctions in view
            </span>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading auctions…
            </div>
          ) : error ? (
            <p className="text-sm text-rose-400">Failed to load auctions. Ensure the Express server is running.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Picture</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Era</TableHead>
                    <TableHead className="text-right">Final price</TableHead>
                    <TableHead className="text-center">Bids</TableHead>
                    <TableHead>Ended at</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((auction) => {
                    const hasKnownSetName = auction.cardSetName && auction.cardSetName.toLowerCase() !== 'unknown'

                    return (
                      <TableRow key={auction.id}>
                        <TableCell className="w-24">
                          <Link to={`/cards/${auction.cardId}`} className="block overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                            {auction.thumbnail ? (
                              <img src={auction.thumbnail} alt={auction.cardName} className="h-16 w-full object-cover" />
                            ) : (
                              <div className="flex h-16 w-full items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                                No image
                              </div>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <div>
                              <Link to={`/cards/${auction.cardId}`} className="text-slate-900 hover:text-sky-600 dark:text-slate-100 dark:hover:text-sky-300">
                                {auction.cardName}
                              </Link>
                              {auction.cardName !== auction.title ? (
                                <div className="text-xs font-normal text-slate-600 dark:text-slate-400">{auction.title}</div>
                              ) : null}
                              {hasKnownSetName ? (
                                <div className="text-xs text-slate-500 dark:text-slate-400">Set: {auction.cardSetName}</div>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{auction.cardEra || 'Unknown era'}</TableCell>
                        <TableCell className="text-right text-slate-900 dark:text-slate-100">
                          {currencyFormatter.format(auction.finalPrice)}
                        </TableCell>
                        <TableCell className="text-center">{auction.bids}</TableCell>
                        <TableCell>
                          <div className="text-slate-900 dark:text-slate-100">{new Date(auction.endTime).toLocaleString()}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">{formatDistanceToNow(parseISO(auction.endTime), { addSuffix: true })}</div>
                        </TableCell>
                        <TableCell>
                          <a
                            href={auction.url}
                            className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
                            target="_blank"
                            rel="noreferrer"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
