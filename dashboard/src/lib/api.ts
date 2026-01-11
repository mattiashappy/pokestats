// src/lib/api.ts
import type { AuctionRecord, CardListItem, CardResponse, EraSummary, ExpansionSummary } from '../types'

type TraderaAuctionDTO = {
  itemId?: number | string | null
  title?: string | null
  endDate?: string | null
  price?: number | null
  bidCount?: number | null
  sellerAlias?: string | null
  itemUrl?: string | null
  thumbnailUrl?: string | null
  pokemonEra?: string | null
  pokemonLanguage?: string | null
  itemCondition?: string | null
}

function mapAuctionRecord(row: TraderaAuctionDTO): AuctionRecord {
  return {
    itemId: row.itemId != null ? String(row.itemId) : '',
    title: row.title ?? 'Untitled auction',
    endDate: row.endDate ?? new Date(0).toISOString(),
    price: row.price ?? null,
    bidCount: row.bidCount ?? null,
    sellerAlias: row.sellerAlias ?? null,
    itemUrl: row.itemUrl ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
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
 * Fetch cards for a set using set_code (matches UX: sets grid -> /era/:eraCode/:setCode -> cards)
 * Backend must support: GET /api/expansions/:setCode/cards
 */
export async function fetchCardsForSet(setCode: string): Promise<CardListItem[]> {
  const code = (setCode || '').trim()
  if (!code) return []

  const response = await fetch(`/api/expansions/${encodeURIComponent(code)}/cards`)
  if (!response.ok) throw new Error('Failed to fetch cards')
  return response.json()
}

export async function fetchCards(): Promise<CardListItem[]> {
  const response = await fetch('/api/cards')
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

export type ParserRunResult = {
  total: number
  withCollectorKey: number
  withSetHint: number
  bundleCount: number
}

export type TraderaParseExample = {
  itemId: number
  title: string | null
  setHint?: string | null
}

export type TraderaParseSummary = {
  total: number
  withCollectorKey: number
  withSetHints: number
  bundles: number
  examples: {
    collectorKey: TraderaParseExample[]
    setHints: TraderaParseExample[]
    bundles: TraderaParseExample[]
  }
}

export type TraderaLinkedExample = {
  itemId: number
  title: string | null
  cardId: number
  cardName: string | null
  setName: string | null
}

export type TraderaLinkSummary = {
  scanned: number
  linked: number
  skipped: number
  skipReasons: Record<string, number>
  linkedExamples: TraderaLinkedExample[]
}

export type AuctionCardLink = {
  itemId: number
  cardId: number
  method: string | null
  confidence: number | null
  linkedAt: string | null
  auctionTitle: string | null
  auctionUrl: string | null
  auctionEndDate: string | null
  auctionPrice: number | null
  auctionBidCount: number | null
  auctionSellerAlias: string | null
  cardName: string | null
  cardNumber: string | null
  setName: string | null
  setCode: string | null
}

export type CardSearchResult = {
  id: number
  name: string | null
  cardNumber: string | null
  setName: string | null
  setCode: string | null
  era: string | null
}

export type UnlinkedAuction = {
  itemId: number
  title: string | null
  description: string | null
  endDate: string | null
  price: number | null
  bidCount: number | null
  itemUrl: string | null
  sellerAlias: string | null
  pokemonEra: string | null
  pokemonLanguage: string | null
  itemCondition: string | null
  detectedCollectorNumber: string | null
  detectedExpansionName: string | null
  detectedExpansionCode: string | null
}

export type LinkingStats = {
  total: number
  linked: number
  unlinked: number
  lastLinkedAt: string | null
}

export async function searchCards(query: string, limit = 50): Promise<CardSearchResult[]> {
  const q = (query || '').trim()
  if (!q) return []

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const params = new URLSearchParams({ q, limit: String(safeLimit) })
  const response = await fetch(`/api/cards/search?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to search cards')
  return response.json()
}

export async function linkAuctionToCard(auctionId: number, cardId: number): Promise<void> {
  const response = await fetch('/api/linking/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auctionId, cardId })
  })
  if (!response.ok) throw new Error('Failed to link auction')
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

export async function runAuctionTitleParser(limit?: number | null): Promise<ParserRunResult> {
  const body = Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}
  const res = await fetch('/api/linking/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('Failed to run parser')
  return res.json()
}

export async function runTraderaParse(limit?: number | null): Promise<TraderaParseSummary> {
  const body = Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}
  const res = await fetch('/api/tradera/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('Failed to parse Tradera auctions')
  return res.json()
}

export async function runTraderaLink(limit?: number | null): Promise<TraderaLinkSummary> {
  const body = Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}
  const res = await fetch('/api/tradera/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('Failed to link Tradera auctions')
  return res.json()
}

export async function fetchAuctionCardLinks(limit = 500): Promise<AuctionCardLink[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000)
  const params = new URLSearchParams({ limit: String(safeLimit) })
  const response = await fetch(`/api/linking/links?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to load auction card links')
  return response.json()
}

export async function fetchUnlinkedAuctions(limit = 500): Promise<UnlinkedAuction[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000)
  const params = new URLSearchParams({ limit: String(safeLimit) })
  const response = await fetch(`/api/linking/unlinked?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to load unlinked auctions')
  return response.json()
}

export async function fetchLinkingStats(): Promise<LinkingStats> {
  const response = await fetch('/api/linking/stats')
  if (!response.ok) throw new Error('Failed to load linking stats')
  return response.json()
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
