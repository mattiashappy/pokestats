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

    if (!expansion.cards_file) {
      throw new Error(`Expansion ${expansion.set_code} is missing cards_file`)
    }

    const cardsPath = path.join(cardsRoot, expansion.cards_file)
    try {
      await fs.promises.access(cardsPath, fs.constants.R_OK)
    } catch (error) {
      throw new Error(`Cards file not found or unreadable for ${expansion.set_code}: ${expansion.cards_file}`)
    }

    const cardData = await readJson(cardsPath)
    if (!cardData || cardData.set_code !== expansion.set_code) {
      throw new Error(`Cards file ${expansion.cards_file} has mismatched set_code`)
    }

    const cards = Array.isArray(cardData.cards) ? cardData.cards : []
    if (cards.length === 0) {
      throw new Error(`Cards file ${expansion.cards_file} does not include any cards`)
    }

    const cardNumbers = new Set()
    const validatedCards = cards.map((card) => {
      if (!card?.name || !card?.card_number) {
        throw new Error(`Card missing name or card_number in ${expansion.cards_file}`)
      }

      const cardNumber = String(card.card_number)
      if (cardNumbers.has(cardNumber)) {
        throw new Error(`Duplicate card_number ${cardNumber} in set ${expansion.set_code}`)
      }
      cardNumbers.add(cardNumber)

      return {
        ...card,
        card_number: cardNumber
      }
    })

    cardsBySetCode[expansion.set_code] = {
      ...cardData,
      cards: validatedCards
    }
  }

  return { expansions, cardsBySetCode }
}

module.exports = { loadCatalog }
