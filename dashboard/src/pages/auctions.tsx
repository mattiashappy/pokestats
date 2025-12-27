import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowUpDown, CalendarClock, ExternalLink, Loader2, Search, SlidersHorizontal } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import type { AuctionRecord } from '../types'

async function fetchAuctions(): Promise<AuctionRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) {
    throw new Error('Failed to fetch auctions')
  }
  return response.json()
}

const endingSoonOptions = [
  { label: 'Any time', value: 'any' },
  { label: 'Ending in 1h', value: '1h' },
  { label: 'Ending in 6h', value: '6h' },
  { label: 'Ending in 24h', value: '24h' }
]

const sortOptions = [
  { label: 'Ending soonest', value: 'endAsc' },
  { label: 'Highest price', value: 'priceDesc' },
  { label: 'Lowest price', value: 'priceAsc' },
  { label: 'Most bids', value: 'bidsDesc' },
  { label: 'Recently added', value: 'addedDesc' }
]

export function AuctionsPage(): JSX.Element {
  const { data, isLoading, error } = useQuery<AuctionRecord[]>({ queryKey: ['auctions'], queryFn: fetchAuctions })

  const [search, setSearch] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [endingSoon, setEndingSoon] = useState<string>('any')
  const [condition, setCondition] = useState<string>('all')
  const [sellerType, setSellerType] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [status, setStatus] = useState<string>('active')
  const [minBids, setMinBids] = useState('')
  const [sortBy, setSortBy] = useState<string>('endAsc')

  const conditions = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.condition) ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const categories = useMemo(() => {
    const unique = new Set<string>(data?.map((auction) => auction.category) ?? [])
    return ['all', ...Array.from(unique)]
  }, [data])

  const totals = useMemo(() => {
    if (!data) {
      return { active: 0, ending24h: 0 }
    }

    const now = new Date()
    const end24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const active = data.filter((auction) => auction.status === 'active').length
    const ending24h = data.filter((auction) => auction.status === 'active' && new Date(auction.endTime) <= end24h).length

    return { active, ending24h }
  }, [data])

  const filteredAndSorted = useMemo(() => {
    if (!data) return []

    const now = new Date()
    const endWindow: Date | null =
      {
        any: null,
        '1h': new Date(now.getTime() + 1 * 60 * 60 * 1000),
        '6h': new Date(now.getTime() + 6 * 60 * 60 * 1000),
        '24h': new Date(now.getTime() + 24 * 60 * 60 * 1000)
      }[endingSoon] ?? null

    const filtered = data.filter((auction) => {
      const matchesSearch =
        !search ||
        auction.title.toLowerCase().includes(search.toLowerCase()) ||
        auction.cardName.toLowerCase().includes(search.toLowerCase()) ||
        auction.seller.toLowerCase().includes(search.toLowerCase())

      const matchesPriceMin = minPrice ? auction.currentPrice >= Number(minPrice) : true
      const matchesPriceMax = maxPrice ? auction.currentPrice <= Number(maxPrice) : true

      const matchesEnding =
        endingSoon === 'any' ||
        (auction.status === 'active' && endWindow !== null && new Date(auction.endTime) <= endWindow)

      const matchesCondition = condition === 'all' || auction.condition === condition
      const matchesSeller = sellerType === 'all' || auction.sellerType === sellerType
      const matchesCategory = category === 'all' || auction.category === category
      const matchesStatus = status === 'all' ? true : auction.status === status
      const matchesBids = minBids ? auction.bids >= Number(minBids) : true

      return (
        matchesSearch &&
        matchesPriceMin &&
        matchesPriceMax &&
        matchesEnding &&
        matchesCondition &&
        matchesSeller &&
        matchesCategory &&
        matchesStatus &&
        matchesBids
      )
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'priceDesc') return b.currentPrice - a.currentPrice
      if (sortBy === 'priceAsc') return a.currentPrice - b.currentPrice
      if (sortBy === 'bidsDesc') return b.bids - a.bids
      if (sortBy === 'addedDesc') return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      return new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
    })
  }, [data, search, minPrice, maxPrice, endingSoon, condition, sellerType, category, status, minBids, sortBy])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auctions</p>
          <h1 className="text-3xl font-bold text-slate-50">Tradera auction scanner</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Browse, sort, and filter live Tradera auctions to zero in on the right cards faster.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <Badge variant="secondary" className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> {totals.active} active auctions
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> {totals.ending24h} ending in 24h
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search by title, seller, or card name. Layer price, bids, and ending windows to narrow results.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-300"
            onClick={() => {
              setSearch('')
              setMinPrice('')
              setMaxPrice('')
              setEndingSoon('any')
              setCondition('all')
              setSellerType('all')
              setCategory('all')
              setStatus('active')
              setMinBids('')
              setSortBy('endAsc')
            }}
          >
            Reset
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Title, card, or seller"
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
              <option value="all">All</option>
            </Select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Ending window</span>
            <Select value={endingSoon} onChange={(event) => setEndingSoon(event.target.value)}>
              {endingSoonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Min price (SEK)</span>
              <Input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Max price (SEK)</span>
              <Input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="5000" />
            </label>
          </div>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Condition</span>
            <Select value={condition} onChange={(event) => setCondition(event.target.value)}>
              {conditions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All' : option}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Seller</span>
            <Select value={sellerType} onChange={(event) => setSellerType(event.target.value)}>
              <option value="all">All</option>
              <option value="trusted">Trusted</option>
              <option value="new">New</option>
            </Select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Category / set</span>
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All' : option}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Minimum bids</span>
            <Input value={minBids} onChange={(event) => setMinBids(event.target.value)} placeholder="0" />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Sort by</span>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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
            <CardDescription>Each row represents a Tradera listing with live filterable metadata.</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Active filter set
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
                    <TableHead>Title</TableHead>
                    <TableHead>Card / item</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-center">Bids</TableHead>
                    <TableHead>Ends</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((auction) => (
                    <TableRow key={auction.id}>
                      <TableCell className="font-semibold text-slate-100">{auction.title}</TableCell>
                      <TableCell>
                        <div className="text-slate-100">{auction.cardName}</div>
                        <div className="text-xs text-slate-400">{auction.category}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-100">{auction.seller}</div>
                        <Badge variant={auction.sellerType === 'trusted' ? 'success' : 'secondary'} className="mt-1 capitalize">
                          {auction.sellerType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-100">
                        {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: auction.currency }).format(
                          auction.currentPrice
                        )}
                      </TableCell>
                      <TableCell className="text-center">{auction.bids}</TableCell>
                      <TableCell>
                        <div className="text-slate-100">
                          {auction.status === 'active'
                            ? formatDistanceToNow(parseISO(auction.endTime), { addSuffix: true })
                            : 'Ended'}
                        </div>
                        <div className="text-xs text-slate-400">{new Date(auction.endTime).toLocaleString()}</div>
                      </TableCell>
                      <TableCell>{auction.condition}</TableCell>
                      <TableCell>{auction.category}</TableCell>
                      <TableCell>{auction.location}</TableCell>
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
