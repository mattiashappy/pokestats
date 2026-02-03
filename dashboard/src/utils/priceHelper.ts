import type { CardResponse, CardPricesData, CardPriceVariant } from '../types'

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
  if (card.price_market && card.price_market > 0) {
    return Number(card.price_market)
  }

  const prices = parsePricesData(card.prices_data)
  if (!prices) return null

  const market = Number((prices as Record<string, unknown>).market ?? prices.market)
  if (Number.isFinite(market) && market > 0) {
    return market
  }

  const variants = prices.variants ?? null
  if (!variants || typeof variants !== 'object') return null

  const priority = ['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition']
  for (const variantKey of priority) {
    const variantPrice = findVariantMarketPrice(variants[variantKey] ?? null)
    if (variantPrice !== null) return variantPrice
  }

  const firstVariant = Object.values(variants).find(Boolean) as CardPriceVariant | null | undefined
  return findVariantMarketPrice(firstVariant)
}

export const getTcgMarketPrice = (card: {
  price_market?: number | null
  prices_data?: PriceDataInput
}): string => {
  const value = getTcgMarketPriceValue(card)
  if (value === null) return 'N/A'
  return formatUsd(value)
}

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
