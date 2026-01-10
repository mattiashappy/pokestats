// src/lib/api.ts
import type { AuctionRecord, CardListItem, CardResponse, EraSummary, ExpansionSummary } from '../types'

type TraderaAuctionDTO = {
  id?: number | string | null
  title?: string | null
  endTime?: string | null
  finalPrice?: number | null
  bids?: number | null
  url?: string | null
  thumbnail?: string | null
  pokemonEra?: string | null
  pokemonLanguage?: string | null
  itemCondition?: string | null
}

function mapAuctionRecord(row: TraderaAuctionDTO): AuctionRecord {
  return {
    id: row.id != null ? String(row.id) : '',
    title: row.title ?? 'Untitled auction',
    finalPrice: row.finalPrice ?? null,
    bids: row.bids ?? null,
    endTime: row.endTime ?? new Date(0).toISOString(),
    url: row.url ?? null,
    thumbnail: row.thumbnail ?? null,
    pokemonEra: row.pokemonEra ?? null,
    pokemonLanguage: row.pokemonLanguage ?? null,
    itemCondition: row.itemCondition ?? null,
    currency: 'SEK'
  }
}

export async function fetchAuctions(): Promise<AuctionRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) throw new Error('Failed to fetch auctions')
  const rows = (await response.json()) as TraderaAuctionDTO[]
  return rows.map(mapAuctionRecord)
}

export async function fetchCardDetails(cardId: number): Promise<CardResponse> {
  const response = await fetch(`/api/cards/${cardId}`)
  if (!response.ok) throw new Error('Failed to fetch card')
  return response.json()
}

export async function fetchCardAuctions(cardId: number): Promise<AuctionRecord[]> {
  const response = await fetch(`/api/cards/${cardId}/auctions`)
  if (!response.ok) throw new Error('Failed to fetch card auctions')
  const rows = (await response.json()) as TraderaAuctionDTO[]
  return rows.map(mapAuctionRecord)
}

export async function fetchExpansions(): Promise<ExpansionSummary[]> {
  const response = await fetch('/api/expansions')
  if (!response.ok) throw new Error('Failed to fetch expansions')
  return response.json()
}

export async function fetchEras(): Promise<EraSummary[]> {
  const response = await fetch('/api/eras')
  if (!response.ok) throw new Error('Failed to fetch eras')
  return response.json()
}

export async function fetchEraExpansions(eraCode: string): Promise<ExpansionSummary[]> {
  const code = (eraCode || '').trim()
  if (!code) return []

  const response = await fetch(`/api/eras/${encodeURIComponent(code)}/expansions`)
  if (!response.ok) throw new Error('Failed to fetch era expansions')
  return response.json()
}

/**
 * Fetch cards for a set using set_code (matches UX: sets grid -> /pokemon/sets/:setCode -> cards)
 * Backend must support: GET /api/expansions/:setCode/cards
 */
export async function fetchCardsForSet(setCode: string): Promise<CardListItem[]> {
  const code = (setCode || '').trim()
  if (!code) return []

  const response = await fetch(`/api/expansions/${encodeURIComponent(code)}/cards`)
  if (!response.ok) throw new Error('Failed to fetch cards')
  return response.json()
}

export type ImportRun = {
  id: number
  source: string
  started_at: string
  finished_at: string | null
  status: string
  new_rows: number
  pages_fetched: number
  requests_used: number
  message?: string | null
  run_uuid?: string | null
  error_stack?: string | null
  error_stack_preview?: string | null
}

export type ImportRun = {
  id: number
  source: string
  started_at: string
  finished_at: string | null
  status: string
  new_rows: number
  pages_fetched: number
  requests_used: number
  message?: string | null
  run_uuid?: string | null
  error_stack?: string | null
  error_stack_preview?: string | null
}

export type ImportRunResult = {
  ok: boolean
  newRows: number
  durationMs: number
  startedAt: string
  lastFetchedAt?: string | null
  output?: string
  runUuid?: string
  exitCode?: number
  error?: string | null
}

const fetchImportRuns = async (limit = 10): Promise<ImportRun[]> => {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100)
  const params = new URLSearchParams({ limit: String(safeLimit) })
  const res = await fetch(`/api/import/runs?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to load import runs')
  return res.json()
}

const fetchImportRun = async (id: number): Promise<ImportRun> => {
  const res = await fetch(`/api/import/runs/${id}`)
  if (!res.ok) throw new Error('Failed to load import run')
  return res.json()
}

const runImporter = async (): Promise<ImportRunResult> => {
  const res = await fetch('/api/import/run', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to run importer')
  return res.json()
}

/**
 * Legacy compatibility: some UI pages may still call fetchSets().
 * Prefer fetchExpansions(), but keep this alias so nothing breaks.
 */
export async function fetchSets(): Promise<ExpansionSummary[]> {
  const res = await fetch('/api/expansions')
  if (!res.ok) throw new Error('Failed to load sets')
  return res.json()
}

// Explicit re-exports to guard against tree-shaking regressions in build tooling.
// These named exports are relied upon by the auction imports page.
export { fetchImportRuns, fetchImportRun, runImporter }
