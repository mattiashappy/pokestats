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