import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '../components/ui/button'
import { fetchExpansions } from '../lib/api'
import { getExpansionIdentifier } from '../lib/sets'
import type { ExpansionSummary } from '../types'

const PAGE_SIZE = 12
const LANGUAGE_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'English', value: 'english' },
  { label: 'Japanese', value: 'japanese' }
]

const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'Pending'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'Pending'
  return `$${parsed.toFixed(2)}`
}

const formatChange = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'Pending'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'Pending'
  const prefix = parsed > 0 ? '+' : ''
  return `${prefix}${parsed.toFixed(2)}%`
}


const formatCardAmount = (expansion: ExpansionSummary): string => {
  const amount = expansion.set_total ?? expansion.pt_card_count ?? expansion.base_total ?? expansion.db_cards_count
  if (amount === null || amount === undefined) return 'Pending'
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || parsed <= 0) return 'Pending'
  return String(parsed)
}

export function SetsPage(): JSX.Element {
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [languageFilter, setLanguageFilter] = useState('all')

  const {
    data: expansions,
    isLoading,
    error
  } = useQuery<ExpansionSummary[]>({
    queryKey: ['expansions', languageFilter],
    queryFn: () => fetchExpansions(languageFilter)
  })

  const filteredExpansions = useMemo(() => {
    if (!expansions) return []
    const term = searchTerm.trim().toLowerCase()
    if (!term) return expansions
    return expansions.filter((expansion) => {
      const haystack = [expansion.name, expansion.set_code, expansion.era, expansion.era_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [expansions, searchTerm])

  const sortedExpansions = useMemo(() => {
    if (!filteredExpansions.length) return []
    return [...filteredExpansions].sort((a, b) => {
      const marketA = Number.isFinite(Number(a.set_market_total)) ? Number(a.set_market_total) : null
      const marketB = Number.isFinite(Number(b.set_market_total)) ? Number(b.set_market_total) : null

      if (marketA === null && marketB === null) {
        return (a.name ?? getExpansionIdentifier(a)).localeCompare(b.name ?? getExpansionIdentifier(b))
      }
      if (marketA === null) return 1
      if (marketB === null) return -1
      if (marketA !== marketB) return marketB - marketA
      return (a.name ?? getExpansionIdentifier(a)).localeCompare(b.name ?? getExpansionIdentifier(b))
    })
  }, [filteredExpansions])

  const totalPages = Math.max(1, Math.ceil(sortedExpansions.length / PAGE_SIZE))

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages))
  }, [totalPages])

  const pagedExpansions = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return sortedExpansions.slice(startIndex, startIndex + PAGE_SIZE)
  }, [page, sortedExpansions])

  const handleSearchChange = (value: string): void => {
    setSearchTerm(value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pokemon set index</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Pokemon Sets</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Browse every Pokemon TCG set in one place with simple pagination.
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <label className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-2 text-sm shadow-[3px_3px_0px_#0f172a]">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              className="w-40 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="League & Championship..."
              type="text"
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 rounded-full border-2 border-slate-900 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[3px_3px_0px_#0f172a]">
            <span>Language</span>
            <select
              className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
              value={languageFilter}
              onChange={(event) => {
                setLanguageFilter(event.target.value)
                setPage(1)
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sets…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">Failed to load sets.</p>
      ) : sortedExpansions.length === 0 ? (
        <p className="text-sm text-slate-500">No sets found yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {sortedExpansions.length} {sortedExpansions.length === 1 ? 'set' : 'sets'} total
            </div>
            <span className="text-xs text-slate-400">•</span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border-2 border-slate-900 bg-white shadow-[4px_4px_0px_#0f172a]">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Card amount</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Total set market price</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">Change (MoM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pagedExpansions.map((expansion) => {
                  const setIdentifier = getExpansionIdentifier(expansion)
                  const params = languageFilter ? new URLSearchParams({ language: languageFilter }).toString() : ''
                  const setLink = params ? `/sets/${setIdentifier}?${params}` : `/sets/${setIdentifier}`
                  const change = Number(expansion.set_market_change_pct)
                  const changeClass = Number.isFinite(change)
                    ? change > 0
                      ? 'text-emerald-700'
                      : change < 0
                        ? 'text-rose-600'
                        : 'text-slate-600'
                    : 'text-slate-600'

                  return (
                    <tr key={String(expansion.id)} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <Link to={setLink} className="underline decoration-slate-300 underline-offset-4 hover:decoration-slate-700">
                          {expansion.name ?? 'Unknown set'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatCardAmount(expansion)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatMoney(expansion.set_market_total)}</td>
                      <td className={`px-4 py-3 font-semibold ${changeClass}`}>{formatChange(expansion.set_market_change_pct)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, sortedExpansions.length)} of{' '}
              {sortedExpansions.length}
            </div>
            <Button
              variant="secondary"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
