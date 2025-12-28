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
  created_at: string
}

export type CardListItem = CardResponse & {
  auction_count: number
  last_sale_at: string | null
}

export type ExpansionSummary = {
  set_code: string | null
  set_name: string
  era: string | null
  set_total: number | null
  card_count: number
  auction_count: number
}

export type EnrichmentSummary = {
  available: boolean
  totalAuctions?: number
  linkedAuctions?: number
  unlinkedAuctions?: number
  needsReview?: number
  error?: string
}
