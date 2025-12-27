export type AuctionRecord = {
  id: string
  title: string
  cardName: string
  seller: string
  sellerType: 'trusted' | 'new'
  currentPrice: number
  currency: string
  bids: number
  endTime: string
  status: 'active' | 'ended'
  condition: string
  category: string
  location: string
  url: string
  addedAt: string
}
