const fs = require('fs')
const path = require('path')

const dataRoot = path.join(__dirname, '..', '..', 'data')
const cardsRoot = path.join(dataRoot, 'cards')

async function readJson(filePath) {
  const contents = await fs.promises.readFile(filePath, 'utf8')
  return JSON.parse(contents)
}

async function loadCatalog() {
  const expansionsPath = path.join(dataRoot, 'expansions.json')
  const expansions = await readJson(expansionsPath)

  if (!Array.isArray(expansions)) {
    throw new Error('Expansions data must be an array')
  }

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

    const cardsFile = expansion.cards_file
    const cardsPath = cardsFile ? path.join(cardsRoot, cardsFile) : null

    if (!cardsFile) {
      console.warn(`Expansion ${expansion.set_code} is missing cards_file; continuing with empty cards`)
      cardsBySetCode[expansion.set_code] = {
        set_code: expansion.set_code,
        cards: []
      }
      continue
    }

    let cardData = null
    try {
      await fs.promises.access(cardsPath, fs.constants.R_OK)
      cardData = await readJson(cardsPath)
    } catch (error) {
      console.warn(
        `Cards file not found, unreadable, or invalid for ${expansion.set_code}: ${cardsFile} (${error.message})`
      )
      cardsBySetCode[expansion.set_code] = {
        set_code: expansion.set_code,
        cards: []
      }
      continue
    }

    if (!cardData || (cardData.set_code && cardData.set_code !== expansion.set_code)) {
      console.warn(`Cards file ${cardsFile} has mismatched set_code; continuing with empty cards`)
      cardsBySetCode[expansion.set_code] = {
        set_code: expansion.set_code,
        cards: []
      }
      continue
    }

    const cards = Array.isArray(cardData.cards) ? cardData.cards : []
    if (cards.length === 0) {
      console.warn(`Cards file ${cardsFile} does not include any cards; continuing with empty cards`)
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
        console.warn(`Card missing name or card_number in ${cardsFile}; skipping card`)
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

  return { expansions, cardsBySetCode }
}

module.exports = { loadCatalog }
