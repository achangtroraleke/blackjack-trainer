// Card value, hand value and Hi-Lo helpers.
// Ranks are numbers 1..10 where 1 = Ace and every ten-valued card is 10.

export const BACK_IMAGE = 'https://deckofcardsapi.com/static/img/back.png'
export const DECK_OPTIONS = [1, 2, 4, 6, 8]
export const CARDS_PER_DECK = 52
export const PENETRATION_LIMIT = 0.25 // reshuffle when ~25% of the shoe remains

const FACE_VALUES = { ACE: 1, KING: 10, QUEEN: 10, JACK: 10 }
const SHORT = { A: 'ACE', K: 'KING', Q: 'QUEEN', J: 'JACK' }

/** Map the Deck of Cards API `value` string to a rank 1..10 (Ace = 1). */
export function rankFromValue(value) {
  const v = String(value).toUpperCase()
  if (v in FACE_VALUES) return FACE_VALUES[v]
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n < 2 || n > 10) throw new Error(`Unknown card value: ${value}`)
  return n
}

/** Convert an API card into the shape used by the app. */
export function normalizeCard(api) {
  return {
    code: api.code,
    image: api.image,
    value: api.value,
    suit: api.suit,
    rank: rankFromValue(api.value),
  }
}

/** Test/helper factory: makeCard('A'), makeCard('K'), makeCard('7'), makeCard('10'). */
export function makeCard(value, suit = 'SPADES') {
  const v = SHORT[String(value).toUpperCase()] || String(value)
  const rank = rankFromValue(v)
  const code = `${rank === 10 && v === '10' ? '0' : String(v)[0]}${suit[0]}`
  return { code, image: `https://deckofcardsapi.com/static/img/${code}.png`, value: v, suit, rank }
}

export const rankOf = (c) => (typeof c === 'number' ? c : c.rank)

/**
 * Hand value. Accepts card objects or raw ranks.
 * `hard` counts every Ace as 1; `total` upgrades one Ace to 11 when that does not bust.
 */
export function handValue(cards) {
  let hard = 0
  let hasAce = false
  for (const c of cards) {
    const r = rankOf(c)
    hard += r
    if (r === 1) hasAce = true
  }
  const soft = hasAce && hard + 10 <= 21
  const total = soft ? hard + 10 : hard
  return { total, hard, soft, bust: total > 21 }
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21

/** Two cards of equal value (any two ten-valued cards count as a pair). */
export const isPair = (cards) => cards.length === 2 && rankOf(cards[0]) === rankOf(cards[1])

export const cardLabel = (card) => (card.rank === 1 ? 'A' : card.value && /^\d+$/.test(card.value) ? card.value : String(card.value)[0])

/** Hi-Lo: 2-6 = +1, 7-9 = 0, 10/J/Q/K/A = -1. */
export function hiLoValue(card) {
  const r = rankOf(card)
  if (r >= 2 && r <= 6) return 1
  if (r >= 7 && r <= 9) return 0
  return -1
}

export const runningCount = (cards) => cards.reduce((sum, c) => sum + hiLoValue(c), 0)

export const decksRemaining = (cardsRemaining) => cardsRemaining / CARDS_PER_DECK

/** True count = running count / decks remaining, rounded to 1 decimal. */
export function trueCount(running, cardsRemaining) {
  const decks = decksRemaining(cardsRemaining)
  if (!(decks > 0)) return 0
  return Math.round((running / decks) * 10) / 10 || 0
}

/** Composition of a full shoe, index 1..10 (index 0 unused). */
export function fullComposition(deckCount) {
  const comp = new Array(11).fill(0)
  for (let r = 1; r <= 9; r++) comp[r] = 4 * deckCount
  comp[10] = 16 * deckCount
  return comp
}

export const emptySeen = () => new Array(11).fill(0)

export const BET_UNIT = 10

/** Simple bet spread: 1 unit at TC <= 1, up to 8 units at TC >= 5. */
export function suggestedUnits(tc) {
  const t = Math.floor(tc)
  if (t <= 1) return 1
  if (t === 2) return 2
  if (t === 3) return 4
  if (t === 4) return 6
  return 8
}

export const formatSigned = (n) => (n > 0 ? `+${n}` : String(n))
