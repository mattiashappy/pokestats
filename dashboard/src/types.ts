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
  image_url: string | null
  product_details: string | null
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

export type CardPreview = {
  id: number
  name: string | null
  set_code: string | null
  set_name: string | null
  card_number: string | null
  image_url: string | null
}

export type EnrichmentAuction = {
  item_id: number
  category_id?: number
  end_date: string
  price: number | null
  bid_count: number | null
  seller_alias: string | null
  seller_dsr?: number | null
  title: string | null
  description?: string | null
  item_url?: string | null
  thumbnail_url?: string | null
  image_urls?: string[] | null
  attributes?: Record<string, unknown>
  fetched_at?: string
  card_id: number | null
  match_confidence: 'high' | 'medium' | 'low' | 'unmatched' | null
  match_method: string | null
  parsed_name?: string | null
  parsed_card_number?: string | null
  parsed_total_in_set?: number | null
  parsed_set_hint?: string | null
  parsed_set_candidates?: Array<{ expansion_id: number; set_code: string; name: string; set_total: number | null }>
  parsed_set_guess?: { expansion_id: number; set_code: string; name: string } | null
  parsed_set_confidence?: string | null
  suggested_cards?: Array<{ id: number; name: string; set_name: string | null; set_code: string | null; card_number: string | null; image_url: string | null }>
  enrich_notes?: Record<string, unknown> | null
  notes?: string | null
  updated_at?: string
  card?: CardPreview | null
}

export type EnrichmentListResponse = {
  items: EnrichmentAuction[]
  total: number
  page: number
  pageSize: number
}

export type EnrichmentSummary = {
  available: boolean
  totalAuctions?: number
  linkedAuctions?: number
  unlinkedAuctions?: number
  needsReview?: number
  error?: string
}