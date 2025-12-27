export type SaleRecord = {
  id: number
  name: string
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Ultra Rare'
  condition: 'Mint' | 'Near Mint' | 'Light Play' | 'Moderate Play'
  price: number
  currency: string
  soldAt: string
  seller: string
  region: string
  tags: string[]
}

export const saleRecords: SaleRecord[] = [
  {
    id: 101,
    name: 'Charizard VMAX (Shiny Vault)',
    rarity: 'Ultra Rare',
    condition: 'Near Mint',
    price: 152.5,
    currency: 'EUR',
    soldAt: '2024-12-02',
    seller: 'NordicCardLab',
    region: 'Sweden',
    tags: ['shiny', 'fan-favorite']
  },
  {
    id: 102,
    name: 'Pikachu (Illustrator Rare)',
    rarity: 'Ultra Rare',
    condition: 'Mint',
    price: 210.0,
    currency: 'EUR',
    soldAt: '2024-12-01',
    seller: 'RetroPoké',
    region: 'Sweden',
    tags: ['illustration', 'promo']
  },
  {
    id: 103,
    name: 'Gardevoir ex (Scarlet & Violet)',
    rarity: 'Rare',
    condition: 'Near Mint',
    price: 34.75,
    currency: 'EUR',
    soldAt: '2024-11-28',
    seller: 'CardForge',
    region: 'Norway',
    tags: ['competitive']
  },
  {
    id: 104,
    name: 'Mewtwo VSTAR (Crown Zenith)',
    rarity: 'Ultra Rare',
    condition: 'Mint',
    price: 96.8,
    currency: 'EUR',
    soldAt: '2024-11-28',
    seller: 'StockholmTCG',
    region: 'Sweden',
    tags: ['legendary', 'vstar']
  },
  {
    id: 105,
    name: 'Umbreon VMAX (Alternate Art)',
    rarity: 'Ultra Rare',
    condition: 'Light Play',
    price: 178.25,
    currency: 'EUR',
    soldAt: '2024-11-26',
    seller: 'MoonlightGames',
    region: 'Finland',
    tags: ['alternate art']
  },
  {
    id: 106,
    name: 'Blastoise (Base Set)',
    rarity: 'Ultra Rare',
    condition: 'Moderate Play',
    price: 85.0,
    currency: 'EUR',
    soldAt: '2024-11-25',
    seller: 'CollectorDen',
    region: 'Sweden',
    tags: ['vintage', 'base set']
  },
  {
    id: 107,
    name: 'Moltres & Zapdos & Articuno GX',
    rarity: 'Ultra Rare',
    condition: 'Near Mint',
    price: 64.4,
    currency: 'EUR',
    soldAt: '2024-11-24',
    seller: 'NordicCardLab',
    region: 'Sweden',
    tags: ['tag team', 'gx']
  },
  {
    id: 108,
    name: 'Miraidon ex (Iron Serpent)',
    rarity: 'Rare',
    condition: 'Near Mint',
    price: 22.8,
    currency: 'EUR',
    soldAt: '2024-11-22',
    seller: 'RetroPoké',
    region: 'Denmark',
    tags: ['scarlet & violet']
  },
  {
    id: 109,
    name: 'Snorlax (Jungle)',
    rarity: 'Rare',
    condition: 'Moderate Play',
    price: 18.6,
    currency: 'EUR',
    soldAt: '2024-11-21',
    seller: 'VintageVista',
    region: 'Sweden',
    tags: ['jungle', 'vintage']
  },
  {
    id: 110,
    name: 'Greninja & Zoroark GX',
    rarity: 'Ultra Rare',
    condition: 'Light Play',
    price: 47.0,
    currency: 'EUR',
    soldAt: '2024-11-20',
    seller: 'CardForge',
    region: 'Finland',
    tags: ['gx', 'tag team']
  }
]
