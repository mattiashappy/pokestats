import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  Download,
  Filter,
  Globe2,
  RefreshCw,
  Search,
  Star,
  TrendingDown,
  TrendingUp
} from 'lucide-react'

import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Select } from './components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'
import { saleRecords } from './data/sales'

const rarityOptions = ['All', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'] as const
const regionOptions = ['All', 'Sweden', 'Norway', 'Finland', 'Denmark'] as const

type SortKey = 'recent' | 'price-desc' | 'price-asc'

const formatCurrency = (value: number, currency: string): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(value)

function App(): JSX.Element {
  const [rarityFilter, setRarityFilter] = useState<(typeof rarityOptions)[number]>('All')
  const [regionFilter, setRegionFilter] = useState<(typeof regionOptions)[number]>('All')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchQuery.toLowerCase()
    const nextRecords = saleRecords.filter((record) => {
      const matchesRarity = rarityFilter === 'All' || record.rarity === rarityFilter
      const matchesRegion = regionFilter === 'All' || record.region === regionFilter
      const matchesSearch =
        !normalizedSearch ||
        record.name.toLowerCase().includes(normalizedSearch) ||
        record.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch))

      return matchesRarity && matchesRegion && matchesSearch
    })

    const sortedRecords = [...nextRecords]
    if (sortKey === 'price-desc') {
      sortedRecords.sort((a, b) => b.price - a.price)
    } else if (sortKey === 'price-asc') {
      sortedRecords.sort((a, b) => a.price - b.price)
    } else {
      sortedRecords.sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt))
    }

    return sortedRecords
  }, [rarityFilter, regionFilter, sortKey, searchQuery])

  const totalVolume = filteredRecords.reduce((sum, record) => sum + record.price, 0)
  const averagePrice = filteredRecords.length ? totalVolume / filteredRecords.length : 0
  const mintShare = filteredRecords.filter((record) => record.condition === 'Mint').length
  const totalUniqueSellers = new Set(filteredRecords.map((record) => record.seller)).size

  const rareCount = filteredRecords.filter((record) => record.rarity === 'Ultra Rare').length
  const rareShare = filteredRecords.length ? Math.round((rareCount / filteredRecords.length) * 100) : 0

  const topSeller = filteredRecords.reduce<Record<string, number>>((acc, record) => {
    acc[record.seller] = (acc[record.seller] ?? 0) + 1
    return acc
  }, {})

  const championSeller = Object.entries(topSeller).sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center gap-3 sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <Star className="h-3.5 w-3.5 text-amber-300" />
            PokeStats Admin
          </p>
          <h1 className="text-3xl font-bold text-slate-50">Market intelligence dashboard</h1>
          <p className="text-sm text-slate-400">
            React + TypeScript + Tailwind + shadcn/ui. Quickly scan Pokémon card performance across the Nordics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="md" className="min-w-[120px]" aria-label="Refresh view">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button size="md" className="min-w-[140px]" aria-label="Export filtered data">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4 md:gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Total volume</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-2xl">
              {formatCurrency(totalVolume, 'EUR')}
              <span className="text-xs font-semibold text-emerald-300">+4.8% vs. last 7d</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-slate-300">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Demand remains strong for Ultra Rare listings.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Avg realized price</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-2xl">
              {formatCurrency(averagePrice, 'EUR')}
              <span className="text-xs font-semibold text-emerald-300">+2.1% WoW</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-slate-300">
            <Badge variant="success">Mint &amp; Near Mint: {mintShare}</Badge>
            <span className="text-slate-400">clean copies drive upside</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Ultra rare mix</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {rareShare}%
              <Badge variant="warning" className="rounded-full">{rareCount} listings</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-slate-300">
            <TrendingDown className="h-4 w-4 text-amber-300" />
            Broadening demand across rarities
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Top seller</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <BadgeCheck className="h-5 w-5 text-sky-300" />
              {championSeller ?? '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-slate-300">
            <Globe2 className="h-4 w-4 text-sky-300" />
            {totalUniqueSellers} active sellers
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-800/80 bg-slate-900/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Sales overview</CardTitle>
            <CardDescription>Filter by rarity, geography, and keyword to focus the table.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Smart filters
            </Button>
            <Button variant="ghost" size="sm">
              <Star className="mr-2 h-4 w-4" />
              Save view
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Search by name or tag
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="e.g. Charizard, tag team, shiny"
                  className="pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Rarity</span>
              <Select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value as typeof rarityFilter)}>
                {rarityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Region</span>
              <Select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value as typeof regionFilter)}>
                {regionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1">{filteredRecords.length} results</span>
            <span className="hidden text-slate-500 sm:inline">•</span>
            <span className="flex items-center gap-2 text-slate-400">
              Sort by
              <Select
                className="h-9 w-auto min-w-[160px]"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="recent">Most recent</option>
                <option value="price-desc">Price: High to low</option>
                <option value="price-asc">Price: Low to high</option>
              </Select>
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Rarity</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Sold</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="text-slate-400">#{record.id}</TableCell>
                  <TableCell className="max-w-[240px]">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-slate-50">{record.name}</span>
                      <span className="text-xs text-slate-500">{record.region}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={record.rarity === 'Ultra Rare' ? 'success' : 'outline'}>{record.rarity}</Badge>
                  </TableCell>
                  <TableCell>{record.condition}</TableCell>
                  <TableCell className="font-semibold text-sky-100">
                    {formatCurrency(record.price, record.currency)}
                  </TableCell>
                  <TableCell className="text-slate-400">{record.soldAt}</TableCell>
                  <TableCell className="text-slate-200">{record.seller}</TableCell>
                  <TableCell className="space-x-1">
                    {record.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="capitalize">
                        {tag}
                      </Badge>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Showing {filteredRecords.length} of {saleRecords.length} imported sales. Data refresh scheduled daily at 02:00 local
              time.
            </span>
            <Button variant="ghost" size="sm" className="text-sky-300">
              View ingestion logs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
