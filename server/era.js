const ERA_DEFINITIONS = [
  { code: 'WOTC', name: 'Wizards of the Coast', sort_order: 10, start_year: 1999, end_year: 2003 },
  { code: 'ESERIES', name: 'e-Series', sort_order: 20, start_year: 2002, end_year: 2003 },
  { code: 'EX', name: 'EX Series', sort_order: 30, start_year: 2003, end_year: 2007 },
  { code: 'DP', name: 'Diamond & Pearl', sort_order: 40, start_year: 2007, end_year: 2009 },
  { code: 'PL', name: 'Platinum', sort_order: 50, start_year: 2009, end_year: 2010 },
  { code: 'HGSS', name: 'HeartGold & SoulSilver', sort_order: 60, start_year: 2010, end_year: 2011 },
  { code: 'BW', name: 'Black & White', sort_order: 70, start_year: 2011, end_year: 2013 },
  { code: 'XY', name: 'XY', sort_order: 80, start_year: 2014, end_year: 2016 },
  { code: 'SM', name: 'Sun & Moon', sort_order: 90, start_year: 2017, end_year: 2019 },
  { code: 'SWSH', name: 'Sword & Shield', sort_order: 100, start_year: 2020, end_year: 2023 },
  { code: 'SV', name: 'Scarlet & Violet', sort_order: 110, start_year: 2023, end_year: null }
]

const ERA_CODE_BY_NAME = new Map(
  ERA_DEFINITIONS.map((era) => [normalizeEraName(era.name), era.code])
)

function normalizeEraName(value) {
  return value ? String(value).trim().toLowerCase() : ''
}

function normalizeEraCode(value) {
  return value ? String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

function resolveEraCode(value) {
  if (!value) return null
  const normalizedName = normalizeEraName(value)
  const known = ERA_CODE_BY_NAME.get(normalizedName)
  if (known) return known
  const normalized = normalizeEraCode(value)
  return normalized || null
}

function getEraDefinition(code) {
  if (!code) return null
  const normalized = normalizeEraCode(code)
  return ERA_DEFINITIONS.find((era) => era.code === normalized) ?? null
}

module.exports = {
  ERA_DEFINITIONS,
  normalizeEraCode,
  normalizeEraName,
  resolveEraCode,
  getEraDefinition
}
