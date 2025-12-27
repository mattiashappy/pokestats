import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowUpDown, CalendarClock, ExternalLink, Loader2, Search, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import type { AuctionRecord } from '../types'
import { fetchAuctions } from '../lib/api'
import { useAdminSettings } from '../providers/admin-settings'

const endedWithinOptions = [
  { label: 'Any time', value: 'any' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Custom range', value: 'custom' }
]

const sortOptions = [
  { label: 'Ended most recently', value: 'endDesc' },
  { label: 'Highest final price', value: 'priceDesc' },
  { label: 'Most bids', value: 'bidsDesc' }
]

export function AuctionsPage(): JSX.Element {
  const { data, isLoading, error } = useQuery<AuctionRecord[]>({ queryKey: ['auctions'], queryFn: fetchAuctions })
  const { importSettings } = useAdminSettings()

  const [search, setSearch] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [endedWithin, setEndedWithin] = useState<string>('any')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [condition, setCondition] = useState<string>('all')
  const [seller, setSeller] = useState<string>('all')
  const [minBids, setMinBids] = useState('')
  const [maxBids, setMaxBids] = useState('')
  const [sortBy, setSortBy] = useState<string>('endDesc')

  const conditions = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.condition) ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const sellers = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.seller) ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const filteredAndSorted = useMemo(() => {
    if (!data) return []

    const now = new Date()
    const customStartDate = customStart ? new Date(customStart) : null
    const customEndDate = customEnd ? new Date(customEnd) : null

    const filtered = data.filter((auction) => {
      const auctionEnd = new Date(auction.endTime)

      const matchesSearch =
        !search ||
        auction.title.toLowerCase().includes(search.toLowerCase()) ||
        auction.cardName.toLowerCase().includes(search.toLowerCase()) ||
        auction.seller.toLowerCase().includes(search.toLowerCase())

      const matchesPriceMin = minPrice ? auction.finalPrice >= Number(minPrice) : true
      const matchesPriceMax = maxPrice ? auction.finalPrice <= Number(maxPrice) : true

      const matchesEndedWindow = (() => {
        if (endedWithin === 'custom') {
          const afterStart = customStartDate ? auctionEnd >= customStartDate : true
          const beforeEnd = customEndDate ? auctionEnd <= customEndDate : true
          return afterStart && beforeEnd
        }

        const thresholds: Record<string, number> = {
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000
        }

        if (endedWithin in thresholds) {
          return now.getTime() - auctionEnd.getTime() <= thresholds[endedWithin]
        }

        return true
      })()

      const matchesCondition = condition === 'all' || auction.condition === condition
      const matchesSeller = seller === 'all' || auction.seller === seller
      const matchesMinBids = minBids ? auction.bids >= Number(minBids) : true
      const matchesMaxBids = maxBids ? auction.bids <= Number(maxBids) : true

      return (
        matchesSearch &&
        matchesPriceMin &&
        matchesPriceMax &&
        matchesEndedWindow &&
        matchesCondition &&
        matchesSeller &&
        matchesMinBids &&
        matchesMaxBids
      )
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'priceDesc') return b.finalPrice - a.finalPrice
      if (sortBy === 'bidsDesc') return b.bids - a.bids
      return new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
    })
  }, [
    condition,
    customEnd,
    customStart,
    data,
    endedWithin,
    maxBids,
    maxPrice,
    minBids,
    minPrice,
    search,
    seller,
    sortBy
  ])

  const lastUpdatedLabel = useMemo(() => {
    if (!importSettings?.lastImportAt) return null
    const lastRun = format(new Date(importSettings.lastImportAt), 'LLL d, HH:mm')
    const coverage = format(new Date(importSettings.coverageStart), 'PPP')
    return `Data last updated: ${lastRun} (ended auctions from ${coverage})`
  }, [importSettings])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
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

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Search by title, seller, or card name. Filter by final price, bids, and when the auction ended.
            </CardDescription>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">All filters apply to ended auctions only.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-700 dark:text-slate-300"
            onClick={() => {
              setSearch('')
              setMinPrice('')
              setMaxPrice('')
              setEndedWithin('any')
              setCustomStart('')
              setCustomEnd('')
              setCondition('all')
              setSeller('all')
              setMinBids('')
              setMaxBids('')
              setSortBy('endDesc')
            }}
          >
            Reset
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Title, card, or seller"
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ended within</span>
            <Select value={endedWithin} onChange={(event) => setEndedWithin(event.target.value)}>
              {endedWithinOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          {endedWithin === 'custom' ? (
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Start date</span>
                <Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">End date</span>
                <Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Min final price (SEK)</span>
              <Input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Max final price (SEK)</span>
              <Input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="5000" />
            </label>
          </div>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Condition</span>
            <Select value={condition} onChange={(event) => setCondition(event.target.value)}>
              {conditions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All' : option}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Seller</span>
            <Select value={seller} onChange={(event) => setSeller(event.target.value)}>
              {sellers.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All sellers' : option}
                </option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Minimum bids</span>
              <Input value={minBids} onChange={(event) => setMinBids(event.target.value)} placeholder="0" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Maximum bids</span>
              <Input value={maxBids} onChange={(event) => setMaxBids(event.target.value)} placeholder="50" />
            </label>
          </div>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sort by</span>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Auctions ({filteredAndSorted.length})</CardTitle>
            <CardDescription>Each row reflects a completed Tradera listing with final prices and bid counts.</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-3 py-1">
              <Badge variant="secondary" className="px-2 py-0 text-[10px] font-semibold uppercase tracking-wide">ended</Badge>
              Archive view
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-3 py-1">
              <ArrowUpDown className="h-4 w-4" /> {sortOptions.find((option) => option.value === sortBy)?.label}
            </span>
          </div>
        </CardHeader>
        <CardContent>
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
                  {filteredAndSorted.map((auction) => (
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
                            <div className="text-xs text-slate-500 dark:text-slate-400">Set: {auction.cardSetName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{auction.cardEra}</TableCell>
                      <TableCell className="text-right text-slate-900 dark:text-slate-100">
                        {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: auction.currency }).format(auction.finalPrice)}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
