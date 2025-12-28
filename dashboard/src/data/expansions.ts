export type Expansion = {
  era: string
  code: string
  name: string
  release: string
  totalCards: number
  secretRares: number
  highlight?: string
}

export const expansions: Expansion[] = [
  // Wizards of the Coast (1999–2003)
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "BS",
    name: "Base Set",
    release: "January 9, 1999",
    totalCards: 102,
    secretRares: 0,
    highlight: "Charizard"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "JU",
    name: "Jungle",
    release: "June 16, 1999",
    totalCards: 64,
    secretRares: 0,
    highlight: "Snorlax"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "FO",
    name: "Fossil",
    release: "October 10, 1999",
    totalCards: 62,
    secretRares: 0,
    highlight: "Lapras"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "B2",
    name: "Base Set 2",
    release: "February 24, 2000",
    totalCards: 130,
    secretRares: 0,
    highlight: "Blastoise"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "TR",
    name: "Team Rocket",
    release: "April 24, 2000",
    totalCards: 83,
    secretRares: 1,
    highlight: "Dark Charizard"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "G1",
    name: "Gym Heroes",
    release: "August 14, 2000",
    totalCards: 132,
    secretRares: 0,
    highlight: "Brock's Rhydon"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "G2",
    name: "Gym Challenge",
    release: "October 16, 2000",
    totalCards: 132,
    secretRares: 0,
    highlight: "Blaine's Charizard"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "N1",
    name: "Neo Genesis",
    release: "December 16, 2000",
    totalCards: 111,
    secretRares: 0,
    highlight: "Lugia"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "N2",
    name: "Neo Discovery",
    release: "June 1, 2001",
    totalCards: 75,
    secretRares: 0,
    highlight: "Espeon"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "N3",
    name: "Neo Revelation",
    release: "September 21, 2001",
    totalCards: 66,
    secretRares: 0,
    highlight: "Suicune"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "N4",
    name: "Neo Destiny",
    release: "February 28, 2002",
    totalCards: 113,
    secretRares: 8,
    highlight: "Shining Charizard"
  },
  {
    era: "🧙 Wizards of the Coast (1999–2003)",
    code: "LC",
    name: "Legendary Collection",
    release: "May 24, 2002",
    totalCards: 110,
    secretRares: 0,
    highlight: "Reverse Charizard"
  },

  // EX Era (2003–2007)
  {
    era: "⚡ EX Era (2003–2007)",
    code: "RS",
    name: "EX Ruby & Sapphire",
    release: "July 1, 2003",
    totalCards: 109,
    secretRares: 2,
    highlight: "Blaziken ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "SS",
    name: "EX Sandstorm",
    release: "September 18, 2003",
    totalCards: 100,
    secretRares: 2,
    highlight: "Typhlosion ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "DR",
    name: "EX Dragon",
    release: "November 24, 2003",
    totalCards: 100,
    secretRares: 3,
    highlight: "Dragonite ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "MA",
    name: "EX Team Magma vs Team Aqua",
    release: "March 1, 2004",
    totalCards: 97,
    secretRares: 2,
    highlight: "Groudon ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "HL",
    name: "EX Hidden Legends",
    release: "June 14, 2004",
    totalCards: 102,
    secretRares: 2,
    highlight: "Regice ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "RG",
    name: "EX FireRed & LeafGreen",
    release: "August 30, 2004",
    totalCards: 116,
    secretRares: 2,
    highlight: "Charizard ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "TRR",
    name: "EX Team Rocket Returns",
    release: "November 8, 2004",
    totalCards: 111,
    secretRares: 2,
    highlight: "Gold Star Torchic"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "DX",
    name: "EX Deoxys",
    release: "February 14, 2005",
    totalCards: 108,
    secretRares: 3,
    highlight: "Deoxys ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "EM",
    name: "EX Emerald",
    release: "May 9, 2005",
    totalCards: 106,
    secretRares: 2,
    highlight: "Rayquaza ☆"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "UF",
    name: "EX Unseen Forces",
    release: "August 22, 2005",
    totalCards: 115,
    secretRares: 2,
    highlight: "Umbreon ☆"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "DS",
    name: "EX Delta Species",
    release: "October 31, 2005",
    totalCards: 114,
    secretRares: 3,
    highlight: "Dragonite δ"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "LM",
    name: "EX Legend Maker",
    release: "February 13, 2006",
    totalCards: 92,
    secretRares: 2,
    highlight: "Arcanine ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "HP",
    name: "EX Holon Phantoms",
    release: "May 3, 2006",
    totalCards: 111,
    secretRares: 3,
    highlight: "Gyarados δ"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "CG",
    name: "EX Crystal Guardians",
    release: "August 30, 2006",
    totalCards: 100,
    secretRares: 3,
    highlight: "Charizard δ"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "DF",
    name: "EX Dragon Frontiers",
    release: "November 8, 2006",
    totalCards: 101,
    secretRares: 3,
    highlight: "Salamence ex"
  },
  {
    era: "⚡ EX Era (2003–2007)",
    code: "PK",
    name: "EX Power Keepers",
    release: "February 14, 2007",
    totalCards: 108,
    secretRares: 2,
    highlight: "Absol ex"
  },

  // Diamond & Pearl (2007–2008)
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "DP",
    name: "Diamond & Pearl",
    release: "May 23, 2007",
    totalCards: 130,
    secretRares: 2,
    highlight: "Dialga LV.X"
  },
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "MT",
    name: "Mysterious Treasures",
    release: "August 22, 2007",
    totalCards: 124,
    secretRares: 2,
    highlight: "Lucario LV.X"
  },
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "SW",
    name: "Secret Wonders",
    release: "November 7, 2007",
    totalCards: 132,
    secretRares: 2,
    highlight: "Gardevoir"
  },
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "GE",
    name: "Great Encounters",
    release: "February 13, 2008",
    totalCards: 106,
    secretRares: 2,
    highlight: "Darkrai"
  },
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "MD",
    name: "Majestic Dawn",
    release: "May 21, 2008",
    totalCards: 100,
    secretRares: 2,
    highlight: "Leafeon LV.X"
  },
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "LA",
    name: "Legends Awakened",
    release: "August 20, 2008",
    totalCards: 146,
    secretRares: 4,
    highlight: "Azelf LV.X"
  },
  {
    era: "💎 Diamond & Pearl (2007–2008)",
    code: "SF",
    name: "Stormfront",
    release: "November 5, 2008",
    totalCards: 106,
    secretRares: 2,
    highlight: "Gengar"
  },

  // Platinum (2009)
  {
    era: "🟣 Platinum (2009)",
    code: "PL",
    name: "Platinum",
    release: "February 11, 2009",
    totalCards: 133,
    secretRares: 3,
    highlight: "Giratina LV.X"
  },
  {
    era: "🟣 Platinum (2009)",
    code: "RR",
    name: "Rising Rivals",
    release: "May 16, 2009",
    totalCards: 120,
    secretRares: 6,
    highlight: "Luxray GL LV.X"
  },
  {
    era: "🟣 Platinum (2009)",
    code: "SV",
    name: "Supreme Victors",
    release: "August 19, 2009",
    totalCards: 153,
    secretRares: 6,
    highlight: "Charizard G LV.X"
  },
  {
    era: "🟣 Platinum (2009)",
    code: "AR",
    name: "Arceus",
    release: "November 4, 2009",
    totalCards: 111,
    secretRares: 3,
    highlight: "Arceus LV.X"
  },

  // HeartGold & SoulSilver (2010)
  {
    era: "❤️ HeartGold & SoulSilver (2010)",
    code: "HS",
    name: "HeartGold & SoulSilver",
    release: "February 10, 2010",
    totalCards: 124,
    secretRares: 6,
    highlight: "Lugia LEGEND"
  },
  {
    era: "❤️ HeartGold & SoulSilver (2010)",
    code: "UN",
    name: "Unleashed",
    release: "May 12, 2010",
    totalCards: 96,
    secretRares: 1,
    highlight: "Entei & Raikou LEGEND"
  },
  {
    era: "❤️ HeartGold & SoulSilver (2010)",
    code: "UD",
    name: "Undaunted",
    release: "August 18, 2010",
    totalCards: 91,
    secretRares: 1,
    highlight: "Umbreon"
  },
  {
    era: "❤️ HeartGold & SoulSilver (2010)",
    code: "TM",
    name: "Triumphant",
    release: "November 3, 2010",
    totalCards: 102,
    secretRares: 1,
    highlight: "Gengar Prime"
  },

  // Call of Legends (2011)
  {
    era: "🌈 Call of Legends (2011)",
    code: "CL",
    name: "Call of Legends",
    release: "February 9, 2011",
    totalCards: 106,
    secretRares: 11,
    highlight: "Shiny Lugia"
  },

  // Black & White (2011–2013)
  {
    era: "⚫ Black & White (2011–2013)",
    code: "BW",
    name: "Black & White",
    release: "April 25, 2011",
    totalCards: 115,
    secretRares: 1,
    highlight: "Reshiram"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "EPO",
    name: "Emerging Powers",
    release: "August 31, 2011",
    totalCards: 98,
    secretRares: 1,
    highlight: "Tornadus"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "NVI",
    name: "Noble Victories",
    release: "November 16, 2011",
    totalCards: 101,
    secretRares: 1,
    highlight: "Victini"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "NXD",
    name: "Next Destinies",
    release: "February 8, 2012",
    totalCards: 103,
    secretRares: 4,
    highlight: "Mewtwo-EX"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "DEX",
    name: "Dark Explorers",
    release: "May 9, 2012",
    totalCards: 111,
    secretRares: 2,
    highlight: "Darkrai-EX"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "DRX",
    name: "Dragons Exalted",
    release: "August 15, 2012",
    totalCards: 128,
    secretRares: 2,
    highlight: "Rayquaza-EX"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "BCR",
    name: "Boundaries Crossed",
    release: "November 7, 2012",
    totalCards: 153,
    secretRares: 4,
    highlight: "Landorus-EX"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "PLS",
    name: "Plasma Storm",
    release: "February 6, 2013",
    totalCards: 138,
    secretRares: 5,
    highlight: "Secret Rare Charizard"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "PLF",
    name: "Plasma Freeze",
    release: "May 8, 2013",
    totalCards: 122,
    secretRares: 2,
    highlight: "Deoxys-EX"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "PLB",
    name: "Plasma Blast",
    release: "August 14, 2013",
    totalCards: 105,
    secretRares: 2,
    highlight: "Genesect-EX"
  },
  {
    era: "⚫ Black & White (2011–2013)",
    code: "LTR",
    name: "Legendary Treasures",
    release: "November 6, 2013",
    totalCards: 140,
    secretRares: 9,
    highlight: "Radiant Collection Mew"
  },

  // XY Era (2014–2016)
  {
    era: "❌ XY Era (2014–2016)",
    code: "XY",
    name: "XY",
    release: "February 5, 2014",
    totalCards: 146,
    secretRares: 2,
    highlight: "Xerneas-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "FLF",
    name: "Flashfire",
    release: "May 7, 2014",
    totalCards: 109,
    secretRares: 3,
    highlight: "Mega Charizard X"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "FFI",
    name: "Furious Fists",
    release: "August 13, 2014",
    totalCards: 111,
    secretRares: 2,
    highlight: "Mega Lucario-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "PHF",
    name: "Phantom Forces",
    release: "November 5, 2014",
    totalCards: 122,
    secretRares: 7,
    highlight: "Mega Gengar-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "PRC",
    name: "Primal Clash",
    release: "February 4, 2015",
    totalCards: 164,
    secretRares: 7,
    highlight: "Primal Groudon-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "ROS",
    name: "Roaring Skies",
    release: "May 6, 2015",
    totalCards: 110,
    secretRares: 5,
    highlight: "Shaymin-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "AOR",
    name: "Ancient Origins",
    release: "August 12, 2015",
    totalCards: 100,
    secretRares: 4,
    highlight: "Hoopa-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "BKT",
    name: "BREAKthrough",
    release: "November 4, 2015",
    totalCards: 165,
    secretRares: 2,
    highlight: "M Mewtwo-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "BKP",
    name: "BREAKpoint",
    release: "February 3, 2016",
    totalCards: 122,
    secretRares: 5,
    highlight: "Gyarados-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "GEN",
    name: "Generations",
    release: "February 22, 2016",
    totalCards: 115,
    secretRares: 0,
    highlight: "Mega Charizard"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "FCO",
    name: "Fates Collide",
    release: "May 2, 2016",
    totalCards: 125,
    secretRares: 2,
    highlight: "Alakazam-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "STS",
    name: "Steam Siege",
    release: "August 3, 2016",
    totalCards: 116,
    secretRares: 6,
    highlight: "Volcanion-EX"
  },
  {
    era: "❌ XY Era (2014–2016)",
    code: "EVO",
    name: "Evolutions",
    release: "November 2, 2016",
    totalCards: 113,
    secretRares: 5,
    highlight: "Mega Charizard Y"
  },

  // Sun & Moon (2017–2019)
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "SUM",
    name: "Sun & Moon",
    release: "February 3, 2017",
    totalCards: 149,
    secretRares: 9,
    highlight: "Secret Rare Ultra Ball"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "GRI",
    name: "Guardians Rising",
    release: "May 5, 2017",
    totalCards: 145,
    secretRares: 12,
    highlight: "Tapu Lele-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "BUS",
    name: "Burning Shadows",
    release: "August 4, 2017",
    totalCards: 169,
    secretRares: 20,
    highlight: "Rainbow Rare Charizard-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "CIN",
    name: "Crimson Invasion",
    release: "November 3, 2017",
    totalCards: 111,
    secretRares: 12,
    highlight: "Guzzlord-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "UPR",
    name: "Ultra Prism",
    release: "February 2, 2018",
    totalCards: 173,
    secretRares: 17,
    highlight: "Cynthia"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "FLI",
    name: "Forbidden Light",
    release: "May 4, 2018",
    totalCards: 150,
    secretRares: 15,
    highlight: "Greninja-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "CES",
    name: "Celestial Storm",
    release: "August 3, 2018",
    totalCards: 183,
    secretRares: 22,
    highlight: "Rayquaza-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "DRM",
    name: "Dragon Majesty",
    release: "September 7, 2018",
    totalCards: 78,
    secretRares: 8,
    highlight: "Gold Rare Ultra Necrozma-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "LOT",
    name: "Lost Thunder",
    release: "November 2, 2018",
    totalCards: 236,
    secretRares: 22,
    highlight: "Lugia-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "TEU",
    name: "Team Up",
    release: "February 1, 2019",
    totalCards: 196,
    secretRares: 21,
    highlight: "Pikachu & Zekrom-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "UNB",
    name: "Unbroken Bonds",
    release: "May 3, 2019",
    totalCards: 234,
    secretRares: 20,
    highlight: "Reshiram & Charizard-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "UNM",
    name: "Unified Minds",
    release: "August 2, 2019",
    totalCards: 258,
    secretRares: 22,
    highlight: "Mewtwo & Mew-GX"
  },
  {
    era: "☀️ Sun & Moon (2017–2019)",
    code: "CEC",
    name: "Cosmic Eclipse",
    release: "November 1, 2019",
    totalCards: 271,
    secretRares: 12,
    highlight: "Arceus & Dialga & Palkia-GX"
  },

  // Sword & Shield (2020–2023)
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "SSH",
    name: "Sword & Shield",
    release: "February 7, 2020",
    totalCards: 202,
    secretRares: 14,
    highlight: "Zacian V"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "RCL",
    name: "Rebel Clash",
    release: "May 1, 2020",
    totalCards: 209,
    secretRares: 17,
    highlight: "Boss's Orders"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "DAA",
    name: "Darkness Ablaze",
    release: "August 14, 2020",
    totalCards: 201,
    secretRares: 14,
    highlight: "Charizard VMAX"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "CPA",
    name: "Champion's Path",
    release: "September 25, 2020",
    totalCards: 80,
    secretRares: 4,
    highlight: "Shiny Charizard V"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "VIV",
    name: "Vivid Voltage",
    release: "November 13, 2020",
    totalCards: 203,
    secretRares: 18,
    highlight: "Rainbow Rare Pikachu VMAX"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "SHF",
    name: "Shining Fates",
    release: "February 19, 2021",
    totalCards: 73,
    secretRares: 1,
    highlight: "Shiny Charizard VMAX"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "BST",
    name: "Battle Styles",
    release: "March 19, 2021",
    totalCards: 183,
    secretRares: 12,
    highlight: "Tyranitar V"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "CRE",
    name: "Chilling Reign",
    release: "June 18, 2021",
    totalCards: 233,
    secretRares: 35,
    highlight: "Alternate Art Blaziken VMAX"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "EVS",
    name: "Evolving Skies",
    release: "August 27, 2021",
    totalCards: 237,
    secretRares: 34,
    highlight: "Alternate Art Rayquaza VMAX"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "CEL",
    name: "Celebrations",
    release: "October 8, 2021",
    totalCards: 50,
    secretRares: 0,
    highlight: "Classic Collection"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "FST",
    name: "Fusion Strike",
    release: "November 12, 2021",
    totalCards: 284,
    secretRares: 20,
    highlight: "Gengar VMAX"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "BRS",
    name: "Brilliant Stars",
    release: "February 25, 2022",
    totalCards: 216,
    secretRares: 14,
    highlight: "Charizard VSTAR"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "ASR",
    name: "Astral Radiance",
    release: "May 27, 2022",
    totalCards: 246,
    secretRares: 27,
    highlight: "Origin Forme Palkia VSTAR"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "PGO",
    name: "Pokémon GO",
    release: "July 1, 2022",
    totalCards: 88,
    secretRares: 10,
    highlight: "Radiant Charizard"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "LOR",
    name: "Lost Origin",
    release: "September 9, 2022",
    totalCards: 247,
    secretRares: 21,
    highlight: "Giratina VSTAR"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "SIT",
    name: "Silver Tempest",
    release: "November 11, 2022",
    totalCards: 245,
    secretRares: 30,
    highlight: "Lugia VSTAR"
  },
  {
    era: "🛡️ Sword & Shield (2020–2023)",
    code: "CRZ",
    name: "Crown Zenith",
    release: "January 20, 2023",
    totalCards: 230,
    secretRares: 10,
    highlight: "Galarian Gallery Mewtwo VSTAR"
  },

  // Scarlet & Violet (2023–2025)
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "SVI",
    name: "Scarlet & Violet",
    release: "March 31, 2023",
    totalCards: 258,
    secretRares: 24,
    highlight: "Miraidon ex"
  },
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "PAL",
    name: "Paldea Evolved",
    release: "June 9, 2023",
    totalCards: 279,
    secretRares: 31,
    highlight: "Iono"
  },
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "OBF",
    name: "Obsidian Flames",
    release: "August 11, 2023",
    totalCards: 230,
    secretRares: 24,
    highlight: "Charizard ex"
  },
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "PAR",
    name: "Paradox Rift",
    release: "November 3, 2023",
    totalCards: 266,
    secretRares: 33,
    highlight: "Iron Valiant ex"
  },
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "TEF",
    name: "Temporal Forces",
    release: "March 22, 2024",
    totalCards: 218,
    secretRares: 20,
    highlight: "Roaring Moon ex"
  },
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "TWM",
    name: "Twilight Masquerade",
    release: "May 24, 2024",
    totalCards: 226,
    secretRares: 21,
    highlight: "Ogerpon ex"
  },
  {
    era: "🔴 Scarlet & Violet (2023–2025)",
    code: "SCR",
    name: "Stellar Crown",
    release: "September 13, 2024",
    totalCards: 220,
    secretRares: 18,
    highlight: "Terapagos ex"
  }
]
