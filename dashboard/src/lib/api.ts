import type { AuctionRecord } from '../types'

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
