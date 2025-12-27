const express = require('express')
const compression = require('compression')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 8000
const distPath = path.join(__dirname, 'dashboard', 'dist')

app.use(compression())
app.use(express.json())

const mockedSales = [
  {
    id: 'T-90101',
    title: 'Scarlet & Violet booster box (sealed)',
    cardName: 'Booster box',
    seller: 'NordicCardLab',
    sellerType: 'trusted',
    currentPrice: 1850,
    currency: 'SEK',
    bids: 18,
    endTime: '2024-12-05T18:30:00Z',
    status: 'active',
    condition: 'Sealed',
    category: 'Scarlet & Violet',
    location: 'Stockholm, SE',
    url: 'https://www.tradera.com/item/123456',
    addedAt: '2024-12-02T12:00:00Z'
  },
  {
    id: 'T-90102',
    title: 'Charizard VMAX Swedish print',
    cardName: 'Charizard VMAX',
    seller: 'RetroPoke',
    sellerType: 'trusted',
    currentPrice: 720,
    currency: 'SEK',
    bids: 11,
    endTime: '2024-12-04T20:15:00Z',
    status: 'active',
    condition: 'Near Mint',
    category: 'Crown Zenith',
    location: 'Gothenburg, SE',
    url: 'https://www.tradera.com/item/223344',
    addedAt: '2024-12-02T09:30:00Z'
  },
  {
    id: 'T-90103',
    title: 'Base Set Venusaur (1999)',
    cardName: 'Venusaur',
    seller: 'CollectorDen',
    sellerType: 'new',
    currentPrice: 1210,
    currency: 'SEK',
    bids: 24,
    endTime: '2024-12-03T19:05:00Z',
    status: 'active',
    condition: 'Lightly Played',
    category: 'Base Set',
    location: 'Malmö, SE',
    url: 'https://www.tradera.com/item/998877',
    addedAt: '2024-12-01T15:45:00Z'
  },
  {
    id: 'T-90104',
    title: 'Neo Genesis Lugia auction',
    cardName: 'Lugia',
    seller: 'MoonlightGames',
    sellerType: 'trusted',
    currentPrice: 940,
    currency: 'SEK',
    bids: 16,
    endTime: '2024-12-02T21:45:00Z',
    status: 'ended',
    condition: 'Played',
    category: 'Neo Genesis',
    location: 'Uppsala, SE',
    url: 'https://www.tradera.com/item/556677',
    addedAt: '2024-11-30T20:10:00Z'
  },
  {
    id: 'T-90105',
    title: 'Pokémon Silver Game Boy cartridge',
    cardName: 'Pokémon Silver',
    seller: 'RetroHandhelds',
    sellerType: 'new',
    currentPrice: 360,
    currency: 'SEK',
    bids: 7,
    endTime: '2024-12-06T17:20:00Z',
    status: 'active',
    condition: 'Used',
    category: 'Games',
    location: 'Stockholm, SE',
    url: 'https://www.tradera.com/item/445566',
    addedAt: '2024-12-02T08:20:00Z'
  },
  {
    id: 'T-90106',
    title: 'Eevee Heroes booster pack lot (JP)',
    cardName: 'Eevee Heroes',
    seller: 'TokyoPulls',
    sellerType: 'trusted',
    currentPrice: 410,
    currency: 'SEK',
    bids: 9,
    endTime: '2024-12-04T16:50:00Z',
    status: 'active',
    condition: 'Sealed',
    category: 'Japanese',
    location: 'Osaka, JP',
    url: 'https://www.tradera.com/item/334455',
    addedAt: '2024-12-01T18:00:00Z'
  },
  {
    id: 'T-90107',
    title: 'Jungle Snorlax holo',
    cardName: 'Snorlax',
    seller: 'VintageVista',
    sellerType: 'trusted',
    currentPrice: 186,
    currency: 'SEK',
    bids: 6,
    endTime: '2024-12-07T10:00:00Z',
    status: 'active',
    condition: 'Moderate Play',
    category: 'Jungle',
    location: 'Copenhagen, DK',
    url: 'https://www.tradera.com/item/112233',
    addedAt: '2024-12-01T07:40:00Z'
  },
  {
    id: 'T-90108',
    title: 'Illustrator Pikachu promo',
    cardName: 'Pikachu (Illustrator)',
    seller: 'CardForge',
    sellerType: 'new',
    currentPrice: 2100,
    currency: 'SEK',
    bids: 31,
    endTime: '2024-12-01T12:00:00Z',
    status: 'ended',
    condition: 'Mint',
    category: 'Promo',
    location: 'Helsinki, FI',
    url: 'https://www.tradera.com/item/778899',
    addedAt: '2024-11-29T10:00:00Z'
  }
]

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/sales', (_req, res) => {
  res.json(mockedSales)
})

app.use(express.static(distPath))

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
