export type AuctionRecord = {
  id: string
  title: string
  cardName: string
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
}
