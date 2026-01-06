const seeds = require('./mock-auctions-seed.json')

const TARGET_COUNT = 10000

function shiftTimestamp(value, minutesToAdd) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const shifted = new Date(date.getTime() + minutesToAdd * 60 * 1000)
  return shifted.toISOString()
}

function adjustNumericValue(base, index, step, minimum = 1) {
  if (!Number.isFinite(base)) return base

  const multiplier = 0.85 + ((index % step) * 0.03)
  const adjusted = Math.round(base * multiplier)
  return Math.max(minimum, adjusted)
}

function createAuctionVariant(seed, index) {
  const rotation = Math.floor(index / seeds.length)
  const id = `T-${(index + 1001).toString().padStart(5, '0')}`
  const minutesOffset = (rotation * seeds.length + (index % seeds.length)) * 13

  return {
    ...seed,
    id,
    url: `https://example.com/auction/${id}`,
    endTime: shiftTimestamp(seed.endTime, minutesOffset),
    addedAt: shiftTimestamp(seed.addedAt, minutesOffset - 60),
    finalPrice: adjustNumericValue(seed.finalPrice, index, 9, 50),
    bids: adjustNumericValue(seed.bids, index, 7, 1)
  }
}

const expandedAuctions = Array.from({ length: TARGET_COUNT }, (_, index) =>
  createAuctionVariant(seeds[index % seeds.length], index)
)

module.exports = expandedAuctions
