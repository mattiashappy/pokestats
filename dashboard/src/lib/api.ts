import type { AuctionRecord } from '../types'

export async function fetchAuctions(): Promise<AuctionRecord[]> {
  const response = await fetch('/api/sales')
  if (!response.ok) {
    throw new Error('Failed to fetch auctions')
  }
  return response.json()
}
