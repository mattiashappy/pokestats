import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowUpDown, CalendarClock, ChevronDown, ExternalLink, Loader2, Search } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

import type { AuctionRecord } from '../types'
import { fetchAuctionsPage } from '../lib/api'
import { useAdminSettings } from '../providers/admin-settings'

const sortOptions = [
  { label: 'Ended most recently', value: 'endDesc' },
  { label: 'Highest final price', value: 'priceDesc' },
  { label: 'Most bids', value: 'bidsDesc' }
] as const

type SortValue = (typeof sortOptions)[number]['value']
type AttributeStat = { label: string; count: number }
const PAGE_SIZE = 50

export function AuctionsPage(): JSX.Element {
  const { importSettings } = useAdminSettings()
  const { attribute } = useParams()

  const [era, setEra] = useState<string>('all')
  const [language, setLanguage] = useState<string>('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortBy, setSortBy] = useState<SortValue>('endDesc')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [searchTerm])

  const { data, isLoading, error } = useQuery<{ rows: AuctionRecord[]; total: number }>({
    queryKey: ['auctions', currentPage, era, language, minPrice, maxPrice, sortBy, debouncedSearchTerm],
    queryFn: () =>
      fetchAuctionsPage({
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
        era,
        language,
        minPrice,
        maxPrice,
        sortBy,
        search: debouncedSearchTerm
      })
  })

  const activeAttribute = (attribute ?? '').toLowerCase()
  const auctions = data?.rows ?? []
  const totalAuctions = data?.total ?? 0

  const eras = useMemo(() => {
    const unique = new Set<string>(auctions.map((auction) => auction.pokemonEra || 'Unknown era') ?? [])
    return ['all', ...Array.from(unique)]
  }, [auctions])

  const languages = useMemo(() => {
    const unique = new Set<string>(auctions.map((auction) => auction.pokemonLanguage || 'Unknown language') ?? [])
    return ['all', ...Array.from(unique)]
  }, [auctions])

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }),
    []
  )

  const stats = useMemo(() => {
    if (!auctions.length) {
      return {
        totalSales: 0,
        totalBids: 0,
        averagePrice: 0,
        averageBids: 0,
        highestSale: 0
      }
    }

    const aggregates = auctions.reduce(
      (acc, auction) => {
        return {
          totalSales: acc.totalSales + (auction.price || 0),
          totalBids: acc.totalBids + (auction.bidCount || 0),
          highestSale: Math.max(acc.highestSale, auction.price || 0)
        }
      },
      { totalSales: 0, totalBids: 0, highestSale: 0 }
    )

    return {
      totalSales: aggregates.totalSales,
      totalBids: aggregates.totalBids,
      averagePrice: aggregates.totalSales / auctions.length,
      averageBids: aggregates.totalBids / auctions.length,
      highestSale: aggregates.highestSale
    }
  }, [auctions])

  const buildDistribution = (
    selector: (auction: AuctionRecord) => string | null | undefined,
    fallback: string
  ): AttributeStat[] => {
    if (!auctions.length) return []

    const counts = auctions.reduce((acc, auction) => {
      const key = selector(auction) || fallback
      acc.set(key, (acc.get(key) ?? 0) + 1)
      return acc
    }, new Map<string, number>())

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  }

  const eraDistribution = useMemo(() => buildDistribution((auction) => auction.pokemonEra, 'Unknown era'), [auctions])
  const languageDistribution = useMemo(
    () => buildDistribution((auction) => auction.pokemonLanguage, 'Unknown language'),
    [auctions]
  )

  const attributeView = useMemo(() => {
    if (activeAttribute === 'era') {
      return { title: 'Eras', description: 'Auction count by Pokémon TCG era.', items: eraDistribution }
    }
    if (activeAttribute === 'language') {
      return { title: 'Languages', description: 'Listing language breakdown across auctions.', items: languageDistribution }
    }
    return null
  }, [activeAttribute, eraDistribution, languageDistribution])


  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, maxPrice, minPrice, era, language, sortBy])

  const totalPages = Math.max(1, Math.ceil(totalAuctions / PAGE_SIZE))

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages))
  }, [totalPages])

  const paginatedAuctions = auctions
  const displayStart = totalAuctions ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const displayEnd = Math.min(currentPage * PAGE_SIZE, totalAuctions)

  const lastUpdatedLabel = useMemo(() => {
    if (!importSettings?.lastImportAt) return null
    const lastRun = format(new Date(importSettings.lastImportAt), 'LLL d, HH:mm')
    const coverage = importSettings.coverageStart
      ? format(new Date(importSettings.coverageStart), 'PPP')
      : 'unknown date'
    return `Data last updated: ${lastRun} (ended auctions from ${coverage})`
  }, [importSettings])

  // ---- Attribute-only pages (no table) ----
  if (attributeView) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-slate-900/70 dark:bg-slate-950/60">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{attributeView.title}</h1>
              <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">{attributeView.description}</p>
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
          <CardHeader>
            <CardTitle>{attributeView.title} overview</CardTitle>
            <CardDescription>{attributeView.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attributeView.items.length ? (
              attributeView.items.map((item) => {
                const percent = totalAuctions ? Math.round((item.count / totalAuctions) * 100) : 0
                return (
                  <div key={item.label} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="truncate font-medium" title={item.label}>
                        {item.label}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.count.toLocaleString('sv-SE')} ({percent}%)
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/80" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground">No data available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Main auctions page ----
  return (
    <div className="space-y-6">
      {/* Header + stats */}
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-md dark:border-slate-900/70 dark:bg-slate-950/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">Tradera Auctions</h1>
          </div>

        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-slate-200/60 bg-white/60 shadow-sm dark:border-slate-900/60 dark:bg-slate-900/60">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auctions</p>
              <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                {totalAuctions.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-slate-500">
                {totalAuctions.toLocaleString('sv-SE')} matching filters
              </p>
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

      {/* Table + filters */}
      <Card>
        <CardHeader className="space-y-4 border-b border-slate-200/70 pb-4 dark:border-slate-900/70">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokémon</p>
              <CardTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Ended auctions</CardTitle>
              <CardDescription>Search the archive and refine by language, era, and price.</CardDescription>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-slate-700 dark:text-slate-300"
              onClick={() => {
                setEra('all')
                setLanguage('all')
                setMinPrice('')
                setMaxPrice('')
                setSortBy('endDesc')
                setSearchTerm('')
                setShowFilters(false)
              }}
            >
              Reset
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 shadow-sm dark:border-slate-900/70 dark:bg-slate-950/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-inner dark:border-slate-800 dark:bg-slate-900/70">
                <Search className="h-4 w-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search titles"
                  className="h-9 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="relative sm:w-auto">
                <Button
                  variant="outline"
                  className="flex w-full items-center justify-between gap-2 border-slate-200 bg-white/90 text-slate-700 shadow-sm hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
                  onClick={() => setShowFilters((prev) => !prev)}
                >
                  <span>Filters</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>

                {showFilters && (
                  <div className="absolute right-0 z-20 mt-2 w-[360px] space-y-4 rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Era
                        </p>
                        <Select value={era} onChange={(event) => setEra(event.target.value)}>
                          {eras.map((option) => (
                            <option key={option} value={option}>
                              {option === 'all' ? 'All eras' : option}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Language
                        </p>
                        <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                          {languages.map((option) => (
                            <option key={option} value={option}>
                              {option === 'all' ? 'All languages' : option}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Min price
                        </p>
                        <Input
                          type="number"
                          value={minPrice}
                          onChange={(event) => setMinPrice(event.target.value)}
                          placeholder="No minimum"
                          inputMode="numeric"
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Max price
                        </p>
                        <Input
                          type="number"
                          value={maxPrice}
                          onChange={(event) => setMaxPrice(event.target.value)}
                          placeholder="No maximum"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Sort by
                      </p>
                      <Select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortValue)}>
                        {sortOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-600 dark:text-slate-200"
                        onClick={() => {
                          setEra('all')
                          setLanguage('all')
                          setMinPrice('')
                          setMaxPrice('')
                          setSortBy('endDesc')
                          setShowFilters(false)
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900/60 dark:text-slate-200">
              <ArrowUpDown className="h-4 w-4" /> {sortOptions.find((option) => option.value === sortBy)?.label}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 shadow-sm dark:bg-slate-900/60 dark:text-slate-200">
              {totalAuctions.toLocaleString('sv-SE')} auctions matching filters · Page {currentPage} of {totalPages}
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
                    <TableHead>Language</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Final price</TableHead>
                    <TableHead className="text-center">Bids</TableHead>
                    <TableHead>Ended at</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {paginatedAuctions.length ? (
                    paginatedAuctions.map((auction) => {
                      return (
                        <TableRow key={auction.itemId}>
                          <TableCell className="w-24">
                            <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                              {auction.thumbnailUrl ? (
                                <img src={auction.thumbnailUrl} alt={auction.title} className="h-16 w-full object-cover" />
                              ) : (
                                <div className="flex h-16 w-full items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                                  No image
                                </div>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                            <div className="text-slate-900 dark:text-slate-100">{auction.title}</div>
                          </TableCell>

                          <TableCell>{auction.pokemonEra || 'Unknown era'}</TableCell>
                          <TableCell>{auction.pokemonLanguage || 'Unknown language'}</TableCell>
                          <TableCell>{auction.itemCondition || 'Unknown condition'}</TableCell>

                          <TableCell className="text-right text-slate-900 dark:text-slate-100">
                            {currencyFormatter.format(auction.price || 0)}
                          </TableCell>

                          <TableCell className="text-center">{auction.bidCount || 0}</TableCell>

                          <TableCell>
                            <div className="text-slate-900 dark:text-slate-100">{new Date(auction.endDate).toLocaleString()}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-400">
                              {formatDistanceToNow(parseISO(auction.endDate), { addSuffix: true })}
                            </div>
                          </TableCell>

                          <TableCell>
                            <a
                              href={auction.itemUrl ?? '#'}
                              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
                              target="_blank"
                              rel="noreferrer"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        No auctions match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>
              Showing {displayStart.toLocaleString('sv-SE')}
              {displayEnd ? `–${displayEnd.toLocaleString('sv-SE')}` : ''} of
              {' '}
              {totalAuctions.toLocaleString('sv-SE')} auctions
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages || !totalAuctions}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
