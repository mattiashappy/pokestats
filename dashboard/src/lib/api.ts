// src/lib/api.ts
import type { AuctionRecord, CardListItem, CardResponse, ExpansionSummary } from '../types'

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

export type EnrichmentRunResult = {
  stage: string
  attempted: number
  updated?: number
  linked?: number
  needs_review?: number
}

export async function runEnrichmentStage(stage: string, limit = 100): Promise<EnrichmentRunResult> {
  const res = await fetch('/api/enrichment/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, limit })
  })

  if (!res.ok) throw new Error(`Failed to run ${stage} stage`)
  return res.json()
}

export async function runFullPipeline(limitPerStage = 100): Promise<{ ok: boolean; stages: EnrichmentRunResult[] }> {
  const res = await fetch('/api/enrichment/run-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limitPerStage })
  })

  if (!res.ok) throw new Error('Failed to run full enrichment pipeline')
  return res.json()
}

export async function runEnrichmentForItem(
  itemId: number
): Promise<{ ok: boolean; stages: EnrichmentRunResult[]; itemId: number }> {
  const res = await fetch('/api/enrichment/run-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId })
  })

  if (!res.ok) throw new Error('Failed to run enrichment for item')
  return res.json()
}

export type EnrichmentStats = {
  unlinked_total: number
  linked_total: number
  stages: {
    era_missing: number
    set_missing: number
    number_missing: number
    name_missing: number
    ready_to_link: number
  }
  invariants: {
    linked_but_not_matched_status: number
    linked_but_missing_fields: number
    matched_status_but_unlinked: number
  }
}

export async function fetchEnrichmentStats(): Promise<EnrichmentStats> {
  const res = await fetch('/api/enrichment/stats')
  if (!res.ok) throw new Error('Failed to load enrichment stats')
  return res.json()
}

export type EnrichmentQueueRow = {
  item_id: number
  title: string | null
  card_id: number | null
  end_date: string | null
  status: string | null
  stage: string | null
  matched_era: string | null
  matched_set_code: string | null
  parsed_card_number: string | null
  parsed_card_name: string | null
  confidence_score: number | null
  method: string | null
  updated_at: string | null
}

export async function fetchEnrichmentQueue(stage: string, limit = 100): Promise<{ stage: string; rows: EnrichmentQueueRow[] }> {
  const params = new URLSearchParams({ stage, limit: String(limit) })
  const res = await fetch(`/api/enrichment/queue?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to load enrichment queue')
  return res.json()
}

export async function fetchEnrichmentAudit(itemId: number) {
  const res = await fetch(`/api/enrichment/audit?itemId=${itemId}`)
  if (!res.ok) throw new Error('Failed to load audit row')
  return res.json() as Promise<{ auction: any; enrichment: any }>
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
