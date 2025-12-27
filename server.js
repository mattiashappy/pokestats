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
    id: '001',
    name: 'Charizard Holo 1st Edition',
    language: 'English',
    condition: 'Mint',
    era: 'Base',
    price: 1250,
    soldAt: '2024-10-01T12:00:00Z',
    tags: ['1st Edition', 'Holo']
  },
  {
    id: '002',
    name: 'Gengar EX',
    language: 'English',
    condition: 'Near Mint',
    era: 'EX',
    price: 320,
    soldAt: '2024-09-26T15:00:00Z',
    tags: ['EX', 'Ghost']
  },
  {
    id: '003',
    name: 'Lugia Neo Genesis',
    language: 'Japanese',
    condition: 'Mint',
    era: 'Neo',
    price: 540,
    soldAt: '2024-09-22T10:00:00Z',
    tags: ['Legendary', 'Neo']
  },
  {
    id: '004',
    name: 'Umbreon V Alt Art',
    language: 'English',
    condition: 'Lightly Played',
    era: 'Modern',
    price: 260,
    soldAt: '2024-09-18T20:00:00Z',
    tags: ['Alt Art', 'Evolving Skies']
  },
  {
    id: '005',
    name: 'Blastoise Shadowless',
    language: 'English',
    condition: 'Near Mint',
    era: 'Base',
    price: 780,
    soldAt: '2024-09-10T09:00:00Z',
    tags: ['Shadowless', 'Starter']
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
