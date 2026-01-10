// src/lib/api.ts
import type { AuctionRecord, CardListItem, CardResponse, EraSummary, ExpansionSummary } from '../types'

type AuctionApiRow = {
  item_id?: number | string | null
  title?: string | null
  price?: number | null
  bid_count?: number | null
  end_date?: string | null
  seller_alias?: string | null
  item_url?: string | null
  thumbnail_url?: string | null
  pokemon_era?: string | null
  pokemon_language?: string | null
  item_condition?: string | null
  description?: string | null
  image_urls?: string[] | null
  tradera_attributes?: Record<string, unknown> | null
  card_id?: number | null
  card_name?: string | null
  card_era?: string | null
  card_set_name?: string | null
  card_set_code?: string | null
  card_number?: string | null
  card_language?: string | null
}

function mapAuctionRecord(row: AuctionApiRow): AuctionRecord {
  const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : null

  return {
    id: row.item_id != null ? String(row.item_id) : '',
    title: row.title ?? 'Untitled auction',
    description: row.description ?? null,
    finalPrice: row.price ?? 0,
    bids: row.bid_count ?? 0,
    endTime: row.end_date ?? new Date(0).toISOString(),
    url: row.item_url ?? null,
    thumbnail: row.thumbnail_url ?? null,
    imageUrls,
    cardEra: row.pokemon_era ?? row.card_era ?? null,
    language: row.pokemon_language ?? row.card_language ?? null,
    itemCondition: row.item_condition ?? null,
    cardId: row.card_id ?? null,
    cardName: row.card_name ?? row.title ?? null,
    cardSetName: row.card_set_name ?? null,
    cardSetCode: row.card_set_code ?? null,
    cardNumber: row.card_number ?? null,
    currency: 'SEK'
  }
}

export async function fetchAuctions(): Promise<AuctionRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) throw new Error('Failed to fetch auctions')
  const rows = (await response.json()) as AuctionApiRow[]
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
  const rows = (await response.json()) as AuctionApiRow[]
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
