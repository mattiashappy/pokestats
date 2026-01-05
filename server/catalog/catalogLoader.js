const fs = require('fs')
const path = require('path')

const dataRoot = path.join(__dirname, '..', '..', 'data')
const cardsRoot = path.join(dataRoot, 'cards')

async function readJson(filePath) {
  const contents = await fs.promises.readFile(filePath, 'utf8')
  return JSON.parse(contents)
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

async function resolveCardsFile(expansion, availableCardFiles) {
  const candidates = []

  if (expansion.cards_file) {
    candidates.push({
      reason: 'cards_file',
      fileName: expansion.cards_file,
      fullPath: path.join(cardsRoot, expansion.cards_file)
    })
  }

  const setCodeKey = normalizeKey(expansion.set_code)
  const nameKey = normalizeKey(expansion.name)

  for (const { fileName, normalizedKey } of availableCardFiles) {
    if (candidates.some((candidate) => candidate.fileName === fileName)) continue

    if (normalizedKey === setCodeKey || (nameKey && normalizedKey === nameKey)) {
      candidates.push({
        reason: normalizedKey === setCodeKey ? 'set_code' : 'name',
        fileName,
        fullPath: path.join(cardsRoot, fileName)
      })
    }
  }

  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate.fullPath, fs.constants.R_OK)
      return { ...candidate, resolved: true }
    } catch (error) {
      // Try next candidate
    }
  }

  return { resolved: false, candidates }
}

let cachedCatalog = null
let lastCatalogLoad = 0
let loadingPromise = null
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000

async function loadCatalog() {
  const now = Date.now()
  if (cachedCatalog && now - lastCatalogLoad < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog
  }

  if (loadingPromise) {
    return loadingPromise
  }

  loadingPromise = (async () => {
    const expansionsPath = path.join(dataRoot, 'expansions.json')
    const expansions = await readJson(expansionsPath)

    if (!Array.isArray(expansions)) {
      throw new Error('Expansions data must be an array')
    }

    const availableCardFiles = (await fs.promises.readdir(cardsRoot))
      .filter((file) => file.toLowerCase().endsWith('.json'))
      .map((fileName) => ({
        fileName,
        normalizedKey: normalizeKey(path.basename(fileName, path.extname(fileName)))
      }))

    const setCodes = new Set()
    const cardsBySetCode = {}

    for (const expansion of expansions) {
      if (!expansion?.set_code) {
        throw new Error('Expansion is missing set_code')
      }

      if (setCodes.has(expansion.set_code)) {
        throw new Error(`Duplicate set_code detected: ${expansion.set_code}`)
      }
      setCodes.add(expansion.set_code)

      const resolvedCardsFile = await resolveCardsFile(expansion, availableCardFiles)

      if (!resolvedCardsFile.resolved) {
        const tried =
          resolvedCardsFile.candidates?.map((candidate) => candidate.fileName).join(', ') || 'none'
        console.warn(
          `No readable cards file found for ${expansion.set_code} (cards_file=${
            expansion.cards_file || 'unset'
          }). Tried: ${tried}`
        )
        cardsBySetCode[expansion.set_code] = {
          set_code: expansion.set_code,
          cards: []
        }
        continue
      }

      let cardData = null
      try {
        cardData = await readJson(resolvedCardsFile.fullPath)
        if (resolvedCardsFile.reason !== 'cards_file') {
          console.warn(
            `Using ${resolvedCardsFile.fileName} for ${expansion.set_code} (matched by ${resolvedCardsFile.reason})`
          )
        }
      } catch (error) {
        console.warn(
          `Cards file not found, unreadable, or invalid for ${expansion.set_code}: ${resolvedCardsFile.fileName} (${error.message})`
        )
        cardsBySetCode[expansion.set_code] = {
          set_code: expansion.set_code,
          cards: []
        }
        continue
      }

      if (!cardData || (cardData.set_code && cardData.set_code !== expansion.set_code)) {
        console.warn(
          `Cards file ${resolvedCardsFile.fileName} has mismatched set_code; continuing with empty cards`
        )
        cardsBySetCode[expansion.set_code] = {
          set_code: expansion.set_code,
          cards: []
        }
        continue
      }

      const cards = Array.isArray(cardData.cards) ? cardData.cards : []
      if (cards.length === 0) {
        console.warn(
          `Cards file ${resolvedCardsFile.fileName} does not include any cards; continuing with empty cards`
        )
        cardsBySetCode[expansion.set_code] = {
          ...cardData,
          set_code: cardData.set_code ?? expansion.set_code,
          cards: []
        }
        continue
      }

      const cardNumbers = new Set()
      const validatedCards = cards.map((card) => {
        if (!card?.name || !card?.card_number) {
          console.warn(`Card missing name or card_number in ${resolvedCardsFile.fileName}; skipping card`)
          return null
        }

        const cardNumber = String(card.card_number)
        if (cardNumbers.has(cardNumber)) {
          console.warn(`Duplicate card_number ${cardNumber} in set ${expansion.set_code}; skipping card`)
          return null
        }
        cardNumbers.add(cardNumber)

        return {
          ...card,
          card_number: cardNumber
        }
      })

      cardsBySetCode[expansion.set_code] = {
        ...cardData,
        set_code: cardData.set_code ?? expansion.set_code,
        cards: validatedCards.filter(Boolean)
      }
    }

    cachedCatalog = { expansions, cardsBySetCode }
    lastCatalogLoad = now
    return cachedCatalog
  })()

  try {
    return await loadingPromise
  } finally {
    loadingPromise = null
  }
}

module.exports = { loadCatalog }
