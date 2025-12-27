import type { AuctionRecord, CardResponse } from '../types'

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
