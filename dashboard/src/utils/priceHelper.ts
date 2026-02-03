import type { CardResponse } from '../types'

type PriceDataInput = CardResponse['prices_data'] | string | null | undefined
type TraderaPriceInput = CardResponse['tradera_market_price'] | null | undefined

const formatUsd = (value: number): string => {
  if (!Number.isFinite(value)) return 'N/A'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

const formatSek = (value: number): string => {
  if (!Number.isFinite(value)) return 'N/A'
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(value)
}

const parsePricesData = (pricesData: PriceDataInput): CardPricesData | null => {
  if (!pricesData) return null
  if (typeof pricesData !== 'string') return pricesData

  try {
    return JSON.parse(pricesData) as CardPricesData
  } catch (error) {
    console.warn('Failed to parse prices_data JSON', error)
    return null
  }
}

const findVariantMarketPrice = (variant: CardPriceVariant | null | undefined): number | null => {
  if (!variant || typeof variant !== 'object') return null
  const marketPrice = Number((variant as Record<string, unknown>).marketPrice ?? variant.market)
  return Number.isFinite(marketPrice) ? marketPrice : null
}

export const getTcgMarketPriceValue = (card: {
  price_market?: number | null
  prices_data?: PriceDataInput
}): number | null => {
  const price = Number(card.tradera_market_price)
  if (!Number.isFinite(price) || price <= 0) return null
  return price
}

export const getTcgMarketPrice = (card: {
  price_market?: number | null
  prices_data?: PriceDataInput
}): string => {
  const value = getTcgMarketPriceValue(card)
  if (value === null) return 'N/A'
  return formatUsd(value)
}

export const getMarketPriceValue = getTcgMarketPriceValue

export const getMarketPrice = getTcgMarketPrice

export const getTraderaMarketPriceValue = (card: {
  tradera_market_price?: TraderaPriceInput
}): number | null => {
  const price = Number(card.tradera_market_price)
  if (!Number.isFinite(price) || price <= 0) return null
  return price
}

export const getTraderaMarketPrice = (card: {
  tradera_market_price?: TraderaPriceInput
}): string => {
  const value = getTraderaMarketPriceValue(card)
  if (value === null) return 'N/A'
  return formatSek(value)
}
