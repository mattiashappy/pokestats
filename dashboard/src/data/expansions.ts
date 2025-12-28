export type Expansion = {
  code: string
  name: string
  release: string
  totalCards: number
  secretRares: number
  highlight?: string
}

export const expansions: Expansion[] = [
  {
    code: "SWSH08",
    name: "Fusion Strike",
    release: "November 12, 2021",
    totalCards: 284,
    secretRares: 20,
    highlight: "Gengar VMAX"
  },
  {
    code: "SWSH12",
    name: "Silver Tempest",
    release: "November 11, 2022",
    totalCards: 245,
    secretRares: 30,
    highlight: "Lugia VSTAR"
  },
  {
    code: "SV01",
    name: "Scarlet & Violet",
    release: "March 31, 2023",
    totalCards: 258,
    secretRares: 24,
    highlight: "Miraidon ex"
  },
  {
    code: "SV02",
    name: "Paldea Evolved",
    release: "June 9, 2023",
    totalCards: 279,
    secretRares: 31,
    highlight: "Iono"
  },
  {
    code: "SV04",
    name: "Paradox Rift",
    release: "November 3, 2023",
    totalCards: 266,
    secretRares: 33,
    highlight: "Iron Valiant ex"
  },
  {
    code: "SWSH09",
    name: "Brilliant Stars",
    release: "February 25, 2022",
    totalCards: 216,
    secretRares: 14,
    highlight: "Charizard VSTAR"
  }
]
