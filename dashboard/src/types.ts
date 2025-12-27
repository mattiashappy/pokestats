export type AuctionRecord = {
  id: string
  title: string
  cardId: number
  cardName: string
  cardEra: string
  cardSetName: string
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
}

export type CardResponse = {
  card: {
    id: number
    name: string
    era: string | null
    set_name: string | null
    card_number: string | null
    created_at: string
  }
  auctions: AuctionRecord[]
}
