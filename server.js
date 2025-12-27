const express = require('express')
const compression = require('compression')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 8000
const distPath = path.join(__dirname, 'dashboard', 'dist')

app.use(compression())
app.use(express.json())

const now = new Date()

function daysAgo(days, hours = 18, minutes = 0) {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

const mockedSales = [
  {
    id: 'T-90101',
    title: 'Scarlet & Violet booster box (sealed)',
    cardName: 'Booster box',
    seller: 'NordicCardLab',
    sellerType: 'trusted',
    finalPrice: 1850,
    currency: 'SEK',
    bids: 18,
    endTime: daysAgo(1, 18, 30),
    condition: 'Sealed',
    category: 'Scarlet & Violet',
    location: 'Stockholm, SE',
    url: 'https://www.tradera.com/item/123456',
    addedAt: daysAgo(3, 12, 0)
  },
  {
    id: 'T-90102',
    title: 'Charizard VMAX Swedish print',
    cardName: 'Charizard VMAX',
    seller: 'RetroPoke',
    sellerType: 'trusted',
    finalPrice: 720,
    currency: 'SEK',
    bids: 11,
    endTime: daysAgo(2, 20, 15),
    condition: 'Near Mint',
    category: 'Crown Zenith',
    location: 'Gothenburg, SE',
    url: 'https://www.tradera.com/item/223344',
    addedAt: daysAgo(4, 9, 30)
  },
  {
    id: 'T-90103',
    title: 'Base Set Venusaur (1999)',
    cardName: 'Venusaur',
    seller: 'CollectorDen',
    sellerType: 'new',
    finalPrice: 1210,
    currency: 'SEK',
    bids: 24,
    endTime: daysAgo(3, 19, 5),
    condition: 'Lightly Played',
    category: 'Base Set',
    location: 'Malmö, SE',
    url: 'https://www.tradera.com/item/998877',
    addedAt: daysAgo(5, 15, 45)
  },
  {
    id: 'T-90104',
    title: 'Neo Genesis Lugia auction',
    cardName: 'Lugia',
    seller: 'MoonlightGames',
    sellerType: 'trusted',
    finalPrice: 940,
    currency: 'SEK',
    bids: 16,
    endTime: daysAgo(4, 21, 45),
    condition: 'Played',
    category: 'Neo Genesis',
    location: 'Uppsala, SE',
    url: 'https://www.tradera.com/item/556677',
    addedAt: daysAgo(6, 20, 10)
  },
  {
    id: 'T-90105',
    title: 'Pokémon Silver Game Boy cartridge',
    cardName: 'Pokémon Silver',
    seller: 'RetroHandhelds',
    sellerType: 'new',
    finalPrice: 360,
    currency: 'SEK',
    bids: 7,
    endTime: daysAgo(5, 17, 20),
    condition: 'Used',
    category: 'Games',
    location: 'Stockholm, SE',
    url: 'https://www.tradera.com/item/445566',
    addedAt: daysAgo(7, 8, 20)
  },
  {
    id: 'T-90106',
    title: 'Eevee Heroes booster pack lot (JP)',
    cardName: 'Eevee Heroes',
    seller: 'TokyoPulls',
    sellerType: 'trusted',
    finalPrice: 410,
    currency: 'SEK',
    bids: 9,
    endTime: daysAgo(6, 16, 50),
    condition: 'Sealed',
    category: 'Japanese',
    location: 'Osaka, JP',
    url: 'https://www.tradera.com/item/334455',
    addedAt: daysAgo(8, 18, 0)
  },
  {
    id: 'T-90107',
    title: 'Jungle Snorlax holo',
    cardName: 'Snorlax',
    seller: 'VintageVista',
    sellerType: 'trusted',
    finalPrice: 186,
    currency: 'SEK',
    bids: 6,
    endTime: daysAgo(7, 10, 0),
    condition: 'Moderate Play',
    category: 'Jungle',
    location: 'Copenhagen, DK',
    url: 'https://www.tradera.com/item/112233',
    addedAt: daysAgo(9, 7, 40)
  },
  {
    id: 'T-90108',
    title: 'Illustrator Pikachu promo',
    cardName: 'Pikachu (Illustrator)',
    seller: 'CardForge',
    sellerType: 'new',
    finalPrice: 2100,
    currency: 'SEK',
    bids: 31,
    endTime: daysAgo(8, 12, 0),
    condition: 'Mint',
    category: 'Promo',
    location: 'Helsinki, FI',
    url: 'https://www.tradera.com/item/778899',
    addedAt: daysAgo(10, 10, 0)
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
