import type { AuctionRecord, CardResponse, EnrichmentSummary } from '../types'

export interface AuctionDiagnosticResult {
  auctions: AuctionRecord[]
  source: 'database' | 'mock'
  error: string | null
}

export async function fetchAuctions(): Promise<AuctionRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) {
    throw new Error('Failed to fetch auctions')
  }
  return response.json()
}

export async function fetchAuctionDiagnostics(): Promise<AuctionDiagnosticResult> {
  const response = await fetch('/api/sales/diagnostic')
  if (!response.ok) {
    throw new Error('Failed to fetch auction diagnostics')
  }
  return response.json()
}

export async function fetchCard(cardId: number): Promise<CardResponse> {
  const response = await fetch(`/api/cards/${cardId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch card')
  }
  return response.json()
}

export async function fetchEnrichmentSummary(): Promise<EnrichmentSummary> {
  const response = await fetch('/api/enrichment/summary')
  if (!response.ok) {
    throw new Error('Failed to fetch enrichment summary')
  }
  return response.json()
}

export interface EnrichmentRunResult {
  ok: boolean
  attempted: number
  linked: number
  needsReview: number
  unmatched: number
  error?: string
}

export async function runEnrichment(limit = 300, threshold = 80): Promise<EnrichmentRunResult> {
  const res = await fetch('/api/enrichment/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, threshold })
  })
  if (!res.ok) throw new Error('Failed to run enrichment')
  return res.json()
}
