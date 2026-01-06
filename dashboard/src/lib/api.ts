// src/lib/api.ts
import type { AuctionRecord, CardListItem, CardResponse, ExpansionSummary } from '../types'

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

export async function runEnrichment(limit = 300) {
  const res = await fetch('/api/enrichment/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit })
  })

  if (!res.ok) throw new Error('Failed to run enrichment')

  return res.json() as Promise<{
    ok: boolean
    attempted: number
    linked: number
    statusCounts: Record<string, number>
    remainingBefore: number | null
    remainingAfter: number | null
    target: string
  }>
}

export async function runUnlinkedEnrichment(limit = 300) {
  const res = await fetch('/api/enrichment/run-unlinked', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit })
  })

  if (!res.ok) throw new Error('Failed to rerun unlinked auctions')

  return res.json() as Promise<{
    ok: boolean
    attempted: number
    linked: number
    statusCounts: Record<string, number>
    remainingBefore: number | null
    remainingAfter: number | null
    target: string
  }>
}

type RunFullEnrichmentOptions = {
  batchSize?: number
  maxRuntimeMs?: number
  resetExisting?: boolean
}

export async function runFullEnrichment({
  batchSize = 500,
  maxRuntimeMs = 55_000,
  resetExisting = false
}: RunFullEnrichmentOptions = {}) {
  const res = await fetch('/api/enrichment/run-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchSize, maxRuntimeMs, resetExisting })
  })

  let data: any = null

  try {
    data = await res.json()
  } catch (_error) {
    const fallbackText = await res.text().catch(() => '')
    data = fallbackText || null
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && typeof data.error === 'string' && data.error) ||
      (data && typeof data === 'object' && typeof data.message === 'string' && data.message) ||
      (typeof data === 'string' && data.trim().slice(0, 500)) ||
      `Failed to run full enrichment (HTTP ${res.status})`

    throw new Error(message)
  }

  return (data || {
    ok: false,
    batchSize,
    batches: 0,
    totalAttempted: 0,
    totalLinked: 0,
    remainingBefore: null,
    remainingAfter: null,
    resetCount: 0,
    statusCounts: {}
  }) as {
    ok: boolean
    batchSize: number
    batches: number
    totalAttempted: number
    totalLinked: number
    remainingBefore: number | null
    remainingAfter: number | null
    resetCount: number
    resetStatusesCount?: number
    statusCounts: Record<string, number>
    durationMs?: number
    timedOut?: boolean
  }
}

export async function fetchSets(): Promise<ExpansionSummary[]> {
  const res = await fetch('/api/sets')
  if (!res.ok) throw new Error('Failed to load sets')
  return res.json()
}

export type EnrichmentSummary = {
  available: boolean
  totalAuctions?: number
  matched?: number
  needsReview?: number
  mismatched?: number
  unprocessed?: number
  unmatched?: number
  linkedAuctions?: number
  processed?: number
  reasons?: {
    noCardNumber?: number
    hasNumberNoSet?: number
    ambiguous?: number
    filteredListing?: number
  }
  fixable?: {
    hasFractionButUnlinked?: number
  }
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
  run_uuid?: string | null
  error_stack?: string | null
  error_stack_preview?: string | null
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
  match_status: string | null
  parsed_card_number: number | null
  parsed_set_total: number | null
  matched_set_code: string | null
}

export type EnrichedAuction = {
  item_id: number
  end_date: string
  title: string
  match_status: string | null
  parsed_card_number: number | null
  parsed_set_total: number | null
  matched_set_code: string | null
  card_id: number | null
  card_name: string | null
  card_number: string | null
  card_set_code: string | null
}

export type PendingAuction = {
  item_id: number
  end_date: string
  title: string | null
  category_id: number | null
  price: number | null
  bid_count: number | null
  seller_alias: string | null
  seller_id: number | null
  seller_dsr: number | null
  enrich_status: string | null
  match_status: string | null
  match_confidence: string | null
  match_confidence_score: number | null
  match_method: string | null
  matched_set_code: string | null
  matched_era: string | null
  parsed_card_no: number | null
  parsed_number_text: string | null
  parsed_card_number: string | null
  parsed_set_total: number | null
  processing_started_at: string | null
  updated_at: string | null
  item_url: string | null
  thumbnail_url: string | null
}

export type LinkedAuction = PendingAuction & {
  card_id: number | null
  card_name: string | null
  card_number: string | null
  card_set_code: string | null
}

export async function fetchUnmatchedAuctions(limit = 25) {
  const res = await fetch(`/api/enrichment/unmatched?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch unmatched auctions')
  return res.json() as Promise<UnmatchedAuction[]>
}

export async function fetchRecentEnrichment(limit = 25) {
  const res = await fetch(`/api/enrichment/recent?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch recent enrichment activity')
  return res.json() as Promise<EnrichedAuction[]>
}

export async function fetchPendingAuctions(limit = 50) {
  const res = await fetch(`/api/enrichment/pending?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch pending auctions')
  return res.json() as Promise<PendingAuction[]>
}

export async function fetchLinkedAuctions(limit = 50) {
  const res = await fetch(`/api/enrichment/linked?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch linked auctions')
  return res.json() as Promise<LinkedAuction[]>
}

export async function manuallyMatchAuction(itemId: number, cardId: number, setCode: string) {
  const res = await fetch('/api/enrichment/manual-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, cardId, setCode })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to apply manual match')
  }

  return res.json() as Promise<{ ok: boolean; itemId: number; cardId: number }>
}

export async function discardAuction(itemId: number) {
  const res = await fetch('/api/enrichment/discard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to discard auction')
  }

  return res.json() as Promise<{ ok: boolean; itemId: number }>
}

export async function fetchImportRuns(limit = 15) {
  const res = await fetch(`/api/import/runs?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch import runs')
  return res.json() as Promise<ImportRun[]>
}

export async function fetchImportRun(id: number) {
  const res = await fetch(`/api/import/runs/${id}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || data.message || 'Failed to fetch import run')
  }
  return res.json() as Promise<ImportRun>
}

export async function runImporter() {
  const res = await fetch('/api/import/run', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
  return data as {
    ok: boolean
    newRows: number
    durationMs: number
    startedAt: string
    lastFetchedAt: string | null
    output?: string
    error?: string
    runUuid?: string
  }
}