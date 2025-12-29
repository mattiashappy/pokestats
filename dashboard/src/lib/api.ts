// src/lib/api.ts
import type { AuctionRecord, CardListItem, CardResponse, ExpansionSummary } from '../types'
import type { EnrichmentAuction, EnrichmentListResponse } from '../types'

export interface AuctionDiagnosticResult {
  auctions: AuctionRecord[]
  source: 'database' | 'mock'
  error: string | null
}

export async function fetchAuctions(): Promise<AuctionRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) throw new Error('Failed to fetch auctions')
  return response.json()
}

export async function fetchEnrichmentAuctions(params: {
  linked?: boolean | null
  confidence?: string | null
  q?: string | null
  hasImage?: boolean
  page?: number
  pageSize?: number
  startDate?: string | null
  endDate?: string | null
}): Promise<EnrichmentListResponse> {
  const search = new URLSearchParams()

  // Only set linked if explicitly provided
  if (params.linked === true) search.set('linked', '1')
  if (params.linked === false) search.set('linked', '0')

  if (params.confidence) search.set('confidence', params.confidence)
  if (params.q) search.set('q', params.q)
  if (params.hasImage) search.set('hasImage', '1')
  if (params.page) search.set('page', String(params.page))
  if (params.pageSize) search.set('pageSize', String(params.pageSize))
  if (params.startDate) search.set('startDate', params.startDate)
  if (params.endDate) search.set('endDate', params.endDate)

  const qs = search.toString()
  const response = await fetch(`/api/enrichment/auctions${qs ? `?${qs}` : ''}`)
  if (!response.ok) throw new Error('Failed to fetch enrichment auctions')
  return response.json()
}

export async function fetchEnrichmentAuction(id: number): Promise<EnrichmentAuction> {
  const response = await fetch(`/api/enrichment/auctions/${id}`)
  if (!response.ok) throw new Error('Failed to fetch auction')
  return response.json()
}

export async function searchEnrichmentCards(q: string, expansionId?: number | null) {
  const search = new URLSearchParams({ q })
  if (expansionId) search.set('expansionId', String(expansionId))
  const response = await fetch(`/api/enrichment/cards/search?${search.toString()}`)
  if (!response.ok) throw new Error('Failed to search cards')
  return response.json() as Promise<
    Array<{
      id: number
      name: string
      set_code: string | null
      set_name: string | null
      card_number: string | null
      image_url: string | null
    }>
  >
}

export async function createEnrichmentCard(payload: {
  name: string
  set_name: string
  set_code?: string | null
  card_number?: string | null
  image_url?: string | null
  era?: string | null
}) {
  const response = await fetch('/api/enrichment/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) throw new Error('Failed to create card')
  return response.json() as Promise<{
    id: number
    name: string
    set_name: string | null
    set_code: string | null
    card_number: string | null
    image_url: string | null
  }>
}

export async function linkEnrichmentAuction(
  id: number,
  payload: { card_id: number; match_confidence?: string; match_method?: string; notes?: string | null }
): Promise<EnrichmentAuction> {
  const response = await fetch(`/api/enrichment/auctions/${id}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('Failed to link auction')
  return response.json()
}

export async function unlinkEnrichmentAuction(id: number, notes?: string | null): Promise<EnrichmentAuction> {
  const response = await fetch(`/api/enrichment/auctions/${id}/unlink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: notes ?? null })
  })
  if (!response.ok) throw new Error('Failed to unlink auction')
  return response.json()
}

export async function reprocessEnrichmentAuctions(limit = 200, onlyUnmatched = true) {
  const response = await fetch('/api/enrichment/auctions/reprocess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, onlyUnmatched })
  })
  if (!response.ok) throw new Error('Failed to reprocess auctions')
  return response.json() as Promise<{ processed: number; linked: number; reviewed: number; unmatched: number }>
}

export async function fetchAuctionDiagnostics(): Promise<AuctionDiagnosticResult> {
  const response = await fetch('/api/sales/diagnostic')
  if (!response.ok) throw new Error('Failed to fetch auction diagnostics')
  return response.json()
}

export async function fetchCardDetails(cardId: number): Promise<CardResponse> {
  const response = await fetch(`/api/cards/${cardId}`)
  if (!response.ok) throw new Error('Failed to fetch card')
  return response.json()
}

export async function fetchCardAuctions(cardId: number): Promise<AuctionRecord[]> {
  const response = await fetch(`/api/cards/${cardId}/auctions`)
  if (!response.ok) throw new Error('Failed to fetch card auctions')
  return response.json()
}

export async function fetchExpansions(): Promise<ExpansionSummary[]> {
  const response = await fetch('/api/expansions')
  if (!response.ok) throw new Error('Failed to fetch expansions')
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

export async function runEnrichment(limit = 300, threshold = 80) {
  const res = await fetch('/api/enrichment/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, threshold })
  })

  if (!res.ok) throw new Error('Failed to run enrichment')

  return res.json() as Promise<{
    ok: boolean
    attempted: number
    linked: number
    needsReview: number
    unmatched: number
  }>
}

export type EnrichmentSummary = {
  available: boolean
  totalAuctions?: number
  linkedAuctions?: number
  unlinkedAuctions?: number
  needsReview?: number
  error?: string
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
}

export async function fetchEnrichmentSummary() {
  const res = await fetch('/api/enrichment/summary')
  if (!res.ok) throw new Error('Failed to fetch enrichment summary')
  return res.json() as Promise<EnrichmentSummary>
}

export type UnmatchedAuction = {
  item_id: number
  end_date: string
  title: string
  parsed_set_guess: string | null
  parsed_number_text: string | null
  enrich_status: string | null
  enrich_confidence: number | null
}

export async function fetchUnmatchedAuctions(limit = 25) {
  const res = await fetch(`/api/enrichment/unmatched?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch unmatched auctions')
  return res.json() as Promise<UnmatchedAuction[]>
}

export async function fetchImportRuns(limit = 15) {
  const res = await fetch(`/api/import/runs?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch import runs')
  return res.json() as Promise<ImportRun[]>
}

export async function runImporter() {
  const res = await fetch('/api/import/run', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to run importer')
  return res.json() as Promise<{
    ok: boolean
    newRows: number
    durationMs: number
    startedAt: string
    lastFetchedAt: string | null
    output?: string
  }>
}