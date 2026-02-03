import type { CardResponse } from '../types'

type TraderaPriceInput = CardResponse['tradera_market_price'] | null | undefined

const formatPrice = (value: number): string => {
  if (!Number.isFinite(value)) return 'N/A'
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(value)
}

export const getBestPriceValue = (card: {
  tradera_market_price?: TraderaPriceInput
}): number | null => {
  const price = Number(card.tradera_market_price)
  if (!Number.isFinite(price) || price <= 0) return null
  return price
}

export const getBestPrice = (card: {
  tradera_market_price?: TraderaPriceInput
}): string => {
  const value = getBestPriceValue(card)
  if (value === null) return 'N/A'
  return formatPrice(value)
}
