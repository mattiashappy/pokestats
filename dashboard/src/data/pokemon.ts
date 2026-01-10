export type PokemonSet = {
  code: string
  name: string
  cardTotal?: number
  notes?: string
}

export type PokemonEra = {
  name: string
  code: string
  sets: PokemonSet[]
  description?: string
}

export const pokemonEras: PokemonEra[] = [
  {
    name: "Scarlet & Violet",
    code: "SV",
    description: "Current era for the Tradera-sourced auctions.",
    sets: [
      { code: "SV10.5", name: "Black Bolt & White Flare" },
      { code: "SV10", name: "Destined Rivals" },
      { code: "SV9", name: "Journey Together" },
      { code: "SV8.5", name: "Prismatic Evolutions" },
      { code: "SV8", name: "Surging Sparks" },
      { code: "SV7", name: "Stellar Crown" },
      { code: "SV6.5", name: "Shrouded Fable" },
      { code: "SV6", name: "Twilight Masquerade" },
      { code: "SV5", name: "Temporal Forces" },
      { code: "SV4.5", name: "Paldean Fates", cardTotal: 200, notes: "Example count from the catalog." },
      { code: "SV4", name: "Paradox Rift" },
      { code: "SV3.5", name: "151" },
      { code: "SV3", name: "Obsidian Flames" },
      { code: "SV2", name: "Paldea Evolved" },
      { code: "SV1", name: "Scarlet & Violet" }
    ]
  }
]
