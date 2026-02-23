// src/types.ts

export type AuctionRecord = {
  itemId: string
  title: string
  endDate: string
  price: number | null
  bidCount: number | null
  sellerAlias?: string | null
  itemUrl: string | null
  thumbnailUrl: string | null
  pokemonEra?: string | null
  pokemonLanguage?: string | null
  itemCondition?: string | null
  currency: string
}

export type CardResponse = {
  id: number | string
  name: string
  era: string | null
  set_name: string | null
  set_code: string | null
  pt_set_id?: string | null
  set_total: number | null
  card_number: string | null
  price_market: number | null
  tradera_market_price?: number | null
  image_url: string | null
  language: string | null
  product_details: string | null
  pokemon_type: string | null
  energy_type: string[] | null
  stage: string | null
  hp: number | null
  flavor_text: string | null
  prices_data: CardPricesData | null
  price_history?: CardPriceHistoryPoint[] | null
  expansion_id: number | null
  created_at: string | null
}

export type CardListItem = CardResponse & {
  linked_auctions: number
  last_seen: string | null
}

export type ExpansionSummary = {
  id: number | string
  set_code: string | null
  pt_set_id?: string | null
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
  image_cdn_url200?: string | null
  image_cdn_url400?: string | null
  image_cdn_url800?: string | null
  cards_total: number
  set_market_total?: number | null
  set_market_change_pct?: number | null
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

export type CardPricesData = {
  market?: number | null
  low?: number | null
  mid?: number | null
  high?: number | null
  listings?: number | null
  sellers?: number | null
  variants?: Record<string, CardPriceVariant | null> | null
  history?: CardPriceHistoryPoint[] | null
  price_history?: CardPriceHistoryPoint[] | null
  market_history?: CardPriceHistoryPoint[] | null
} & Record<string, unknown>

export type CardPriceVariant = {
  market?: number | null
  low?: number | null
  mid?: number | null
  high?: number | null
} & Record<string, unknown>

export type CardPriceHistoryPoint = {
  date?: string
  timestamp?: string | number
  time?: string | number
  created_at?: string
  market?: number | null
  price?: number | null
  value?: number | null
  variants?: Record<string, CardPriceVariant | number | null> | null
} & Record<string, unknown>
