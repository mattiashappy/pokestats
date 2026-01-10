// src/types.ts

export type AuctionRecord = {
  id: string
  title: string
  description?: string | null
  finalPrice: number
  bids: number
  endTime: string
  url: string | null
  thumbnail: string | null
  imageUrls?: string[] | null
  cardEra: string | null
  language?: string | null
  itemCondition?: string | null
  cardId?: number | null
  cardName?: string | null
  cardSetName?: string | null
  cardSetCode?: string | null
  cardNumber?: string | null
  currency: string
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
  era_code?: string | null
  era_name?: string | null
  language: string | null
  set_number: number | null
  cards_in_set: number | null
  set_total: number | null
  release_date: string | null
  image_url: string | null
  cards_total: number
  linked_auctions: number
}

export type EraSummary = {
  id: number | null
  code: string
  name: string
  sort_order: number
  start_year: number | null
  end_year: number | null
  sets_total: number
}

export type CardPreview = {
  id: number
  name: string | null
  set_code: string | null
  set_name: string | null
  card_number: string | null
  image_url: string | null
}
