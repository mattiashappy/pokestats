import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Filter, Loader2, Search } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import type { SaleRecord } from '../types'

async function fetchSales(): Promise<SaleRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) {
    throw new Error('Failed to fetch sales')
  }
  return response.json()
}

export function SalesPage(): JSX.Element {
  const { data, isLoading, error } = useQuery<SaleRecord[]>({ queryKey: ['sales'], queryFn: fetchSales })
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('All')
  const [condition, setCondition] = useState('All')
  const [era, setEra] = useState('All')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const languageOptions = useMemo<string[]>(() => {
    const unique = new Set<string>(data?.map((sale) => sale.language) ?? ['Swedish', 'English', 'Japanese'])
    return ['All', ...Array.from(unique)]
  }, [data])

  const conditionOptions = useMemo<string[]>(() => {
    const unique = new Set<string>(data?.map((sale) => sale.condition) ?? ['Sealed', 'Near Mint', 'Lightly Played'])
    return ['All', ...Array.from(unique)]
  }, [data])

  const eraOptions = useMemo<string[]>(() => {
    const unique = new Set<string>(data?.map((sale) => sale.era) ?? ['Modern', 'Vintage', 'Neo'])
    return ['All', ...Array.from(unique)]
  }, [data])

  const filteredSales = useMemo(() => {
    if (!data) return []
    return data.filter((sale) => {
      const matchesSearch =
        !search ||
        sale.name.toLowerCase().includes(search.toLowerCase()) ||
        sale.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
      const matchesLanguage = language === 'All' || sale.language === language
      const matchesCondition = condition === 'All' || sale.condition === condition
      const matchesEra = era === 'All' || sale.era === era
      const matchesStart = startDate ? new Date(sale.soldAt) >= new Date(startDate) : true
      const matchesEnd = endDate ? new Date(sale.soldAt) <= new Date(endDate) : true
      return matchesSearch && matchesLanguage && matchesCondition && matchesEra && matchesStart && matchesEnd
    })
  }, [data, search, language, condition, era, startDate, endDate])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auctions</p>
          <h1 className="text-2xl font-bold text-slate-50">Tradera auction feed</h1>
          <p className="text-sm text-slate-400">React Query loads pre-imported Tradera auction results so users always start with data.</p>
        </div>
        <Button variant="secondary" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Save view
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and refine auctions by language, condition, and era. Date range is a placeholder.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Gengar, Charizard, illustrator"
                className="pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Language</span>
            <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languageOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Condition</span>
            <Select value={condition} onChange={(event) => setCondition(event.target.value)}>
              {conditionOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Era</span>
            <Select value={era} onChange={(event) => setEra(event.target.value)}>
              {eraOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2 md:col-span-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Start</span>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">End</span>
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Sales ({filteredSales.length})</CardTitle>
            <CardDescription>Rows are seeded from recent Tradera auction exports.</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ready for Stripe</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-sky-400" /> API mocked
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sales…
            </div>
          ) : error ? (
            <p className="text-sm text-rose-400">Failed to load sales. Ensure the Express server is running.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Era</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Sold at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="space-y-1">
                      <div className="font-semibold text-slate-100">{sale.name}</div>
                      <div className="text-xs text-slate-400">{sale.tags.join(', ')}</div>
                    </TableCell>
                    <TableCell>{sale.language}</TableCell>
                    <TableCell>
                      <Badge variant={['Sealed', 'Near Mint'].includes(sale.condition) ? 'success' : 'secondary'}>
                        {sale.condition}
                      </Badge>
                    </TableCell>
                    <TableCell>{sale.era}</TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('sv-SE', {
                        style: 'currency',
                        currency: 'SEK'
                      }).format(sale.price)}
                    </TableCell>
                    <TableCell className="text-slate-300">{format(new Date(sale.soldAt), 'PPP')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
