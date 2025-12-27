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
    name: 'Tradera · Pokémon Scarlet & Violet Booster Box (sealed)',
    language: 'Swedish',
    condition: 'Sealed',
    era: 'Modern',
    price: 1850,
    soldAt: '2024-12-01T18:30:00Z',
    tags: ['Tradera', 'Auction', 'Factory sealed']
  },
  {
    id: 'T-90102',
    name: 'Tradera · Charizard VMAX (Swedish print)',
    language: 'Swedish',
    condition: 'Near Mint',
    era: 'Modern',
    price: 720,
    soldAt: '2024-11-29T20:15:00Z',
    tags: ['Tradera', 'Auction', 'Chase card']
  },
  {
    id: 'T-90103',
    name: 'Tradera · Base Set Venusaur (1999)',
    language: 'English',
    condition: 'Lightly Played',
    era: 'Vintage',
    price: 1210,
    soldAt: '2024-11-28T19:05:00Z',
    tags: ['Tradera', 'Auction', 'Vintage']
  },
  {
    id: 'T-90104',
    name: 'Tradera · Neo Genesis Lugia (auction)',
    language: 'English',
    condition: 'Played',
    era: 'Neo',
    price: 940,
    soldAt: '2024-11-27T21:45:00Z',
    tags: ['Tradera', 'Auction', 'Collector']
  },
  {
    id: 'T-90105',
    name: 'Tradera · Pokémon Silver Game Boy cartridge',
    language: 'Swedish',
    condition: 'Used',
    era: 'Retro',
    price: 360,
    soldAt: '2024-11-26T17:20:00Z',
    tags: ['Tradera', 'Auction', 'Game']
  },
  {
    id: 'T-90106',
    name: 'Tradera · Japanese Eevee Heroes booster pack lot',
    language: 'Japanese',
    condition: 'Sealed',
    era: 'Modern',
    price: 410,
    soldAt: '2024-11-25T16:50:00Z',
    tags: ['Tradera', 'Auction', 'Sealed product']
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
