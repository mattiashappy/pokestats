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

export async function fetchCardDetails(cardId: number | string): Promise<CardResponse> {
  const response = await fetch(`/api/cards/${cardId}`)
  if (!response.ok) throw new Error('Failed to fetch card')
  return response.json()
}

export async function fetchCardAuctions(cardId: number | string): Promise<AuctionRecord[]> {
  const response = await fetch(`/api/cards/${cardId}/auctions`)
  if (!response.ok) throw new Error('Failed to fetch card auctions')
  const rows = (await response.json()) as TraderaAuctionDTO[]
  return rows.map(mapAuctionRecord)
}

export async function fetchExpansions(language?: string): Promise<ExpansionSummary[]> {
  const params = language ? new URLSearchParams({ language }) : null
  const response = await fetch(params ? `/api/expansions?${params.toString()}` : '/api/expansions')
  if (!response.ok) throw new Error('Failed to fetch expansions')
  return response.json()
}

export async function fetchEras(): Promise<EraSummary[]> {
  const response = await fetch('/api/eras')
  if (!response.ok) throw new Error('Failed to fetch eras')
  return response.json()
}

export async function fetchEraExpansions(eraCode: string, language?: string): Promise<ExpansionSummary[]> {
  const code = (eraCode || '').trim()
  if (!code) return []

  const params = language ? new URLSearchParams({ language }) : null
  const response = await fetch(
    params ? `/api/eras/${encodeURIComponent(code)}/expansions?${params.toString()}` : `/api/eras/${encodeURIComponent(code)}/expansions`
  )
  if (!response.ok) throw new Error('Failed to fetch era expansions')
  return response.json()
}

/**
 * Fetch cards for a set using set identifier (local set_code or PT pt_set_id).
 * Backend must support: GET /api/expansions/:setCode/cards
 */
export async function fetchCardsForSet(setCode: string, language?: string): Promise<CardListItem[]> {
  const code = (setCode || '').trim()
  if (!code) return []

  const params = language ? new URLSearchParams({ language }) : null
  const response = await fetch(
    params
      ? `/api/expansions/${encodeURIComponent(code)}/cards?${params.toString()}`
      : `/api/expansions/${encodeURIComponent(code)}/cards`
  )
  if (!response.ok) throw new Error('Failed to fetch cards')
  return response.json()
}

type CardQueryOptions = {
  search?: string
  limit?: number
  offset?: number
  language?: string
}

export async function fetchCards(options: CardQueryOptions = {}): Promise<CardListItem[]> {
  const params = new URLSearchParams()
  if (options.search) params.set('search', options.search)
  if (Number.isFinite(options.limit)) params.set('limit', String(options.limit))
  if (Number.isFinite(options.offset)) params.set('offset', String(options.offset))
  if (options.language) params.set('language', options.language)

  const query = params.toString()
  const response = await fetch(query ? `/api/cards?${query}` : '/api/cards')
  if (!response.ok) throw new Error('Failed to fetch cards')
  return response.json()
}

export async function fetchCardsPreview(limit = 4, language?: string): Promise<CardListItem[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 12)
  const params = new URLSearchParams({ limit: String(safeLimit) })
  if (language) params.set('language', language)
  const response = await fetch(`/api/cards?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch cards preview')
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
  cardId: string
  cardName: string | null
  setName: string | null
}

export type TraderaSkippedExample = {
  itemId: number
  title: string | null
}

export type TraderaLinkSummary = {
  scanned: number
  linked: number
  skipped: number
  skipReasons: Record<string, number>
  skippedExamples: Record<string, TraderaSkippedExample[]>
  linkedExamples: TraderaLinkedExample[]
}

export type AiMatchExample = {
  itemId: number
  title: string | null
  cardId: string | null
  confidence: number
  rationale: string | null
}

export type MatchLogEntry = {
  itemId: number
  stage: string
  message: string
  data?: unknown
}

export type AiMatchSummary = {
  scanned: number
  matched: number
  skipped: number
  skipReasons: Record<string, number>
  matchedExamples: AiMatchExample[]
  logs: MatchLogEntry[]
}

export type VisionMatchExample = {
  itemId: number
  title: string | null
  cardId: string
  confidence: number
  method: string
}

export type VisionMatchSummary = {
  scanned: number
  matched: number
  linked: number
  skipped: number
  skipReasons: Record<string, number>
  matchedExamples: VisionMatchExample[]
  logs: MatchLogEntry[]
}

export type AuctionCardLink = {
  itemId: number
  cardId: string
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
  id: string
  name: string | null
  cardNumber: string | null
  setName: string | null
  setCode: string | null
  ptSetId?: string | null
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

export async function searchCards(
  query: string,
  limit = 50,
  source: 'price-tracker' | 'database' = 'price-tracker',
  language?: string
): Promise<CardSearchResult[]> {
  const q = (query || '').trim()
  if (!q) return []

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const params = new URLSearchParams({ q, limit: String(safeLimit), source })
  if (language) params.set('language', language)
  const response = await fetch(`/api/cards/search?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to search cards')
  return response.json()
}

export async function linkAuctionToCard(auctionId: number, cardId: string): Promise<void> {
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

export async function runAiMatch(itemIds: number[], model?: string): Promise<AiMatchSummary> {
  const normalizedIds = Array.from(new Set(itemIds)).filter((id) => Number.isFinite(Number(id)))
  const body = {
    itemIds: normalizedIds,
    model
  }
  const res = await fetch('/api/ai/tradera/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error('Failed to run AI match')
  return res.json()
}

export async function runVisionMatch(
  itemIds: number[],
  options: { model?: string; minConfidence?: number } = {}
): Promise<VisionMatchSummary> {
  const normalizedIds = Array.from(new Set(itemIds)).filter((id) => Number.isFinite(Number(id)))
  const body = {
    itemIds: normalizedIds,
    model: options.model,
    minConfidence: options.minConfidence
  }
  const res = await fetch('/api/ai/tradera/vision-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let message = 'Failed to run vision match'
    try {
      const payload = await res.json()
      if (payload?.error) message = payload.error
    } catch (error) {
      // Ignore JSON parsing errors and use fallback message.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchAuctionCardLinks(limit: number | null = null): Promise<AuctionCardLink[]> {
  const hasLimit = typeof limit === 'number' && Number.isFinite(limit)
  const params = hasLimit ? new URLSearchParams({ limit: String(limit) }) : null
  const response = await fetch(params ? `/api/linking/links?${params.toString()}` : '/api/linking/links')
  if (!response.ok) throw new Error('Failed to load auction card links')
  return response.json()
}

export async function fetchUnlinkedAuctions(limit: number | null = null): Promise<UnlinkedAuction[]> {
  const hasLimit = typeof limit === 'number' && Number.isFinite(limit)
  const params = hasLimit ? new URLSearchParams({ limit: String(limit) }) : null
  const response = await fetch(params ? `/api/linking/unlinked?${params.toString()}` : '/api/linking/unlinked')
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
export async function fetchSets(language?: string): Promise<ExpansionSummary[]> {
  const params = language ? new URLSearchParams({ language }) : null
  const res = await fetch(params ? `/api/expansions?${params.toString()}` : '/api/expansions')
  if (!res.ok) throw new Error('Failed to load sets')
  return res.json()
}

// Explicit re-exports to guard against tree-shaking regressions in build tooling.
// These named exports are relied upon by the auction imports page.
export { fetchImportRuns, fetchImportRun, runImporter }
