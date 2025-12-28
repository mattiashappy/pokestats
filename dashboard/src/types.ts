// src/types.ts

export type AuctionRecord = {
  id: string
  title: string
  cardId: number | null
  cardName: string
  cardEra: string
  cardSetName: string
  cardSetCode?: string | null
  cardNumber: string | null
  seller: string
  sellerType: 'trusted' | 'new'
  finalPrice: number
  currency: string
  bids: number
  endTime: string
  condition: string
  category: string
  location: string
  url: string
  addedAt: string
  thumbnail: string | null
  language?: string | null
  gradingCompany?: string | null
  grade?: string | null
  rawAttributes?: Record<string, unknown>
}

export type CardResponse = {
  id: number
  name: string
  era: string | null
  set_name: string | null
  set_code: string | null
  set_total: number | null
  card_number: string | null
  expansion_id: number | null
  created_at: string
}

export type CardListItem = CardResponse & {
  linked_auctions: number
  last_seen: string | null
}

export type ExpansionSummary = {
  id: number
  set_code: string
  name: string | null
  era: string | null
  language: string | null
  set_total: number | null
  release_date: string | null
  image_url: string | null
  cards_total: number
  linked_auctions: number
}

export type EnrichmentSummary = {
  available: boolean
  totalAuctions?: number
  linkedAuctions?: number
  unlinkedAuctions?: number
  needsReview?: number
  error?: string
}