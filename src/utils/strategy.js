// Basic strategy tables (dealer stands on soft 17, double after split, late surrender,
// dealer peeks for blackjack) plus Hi-Lo index deviations (Illustrious 18 + Fab 4).

import { handValue, rankOf, isPair } from './cards.js'

const row = (s) => s.trim().split(/\s+/)

export const DEALER_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']
/** Column index for a dealer upcard rank (1 = Ace). */
export const colIndex = (up) => (up === 1 ? 9 : up - 2)

export const HARD_ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
export const SOFT_ROWS = [13, 14, 15, 16, 17, 18, 19, 20]
export const PAIR_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const hardLabel = (t) => (t === 8 ? '5–8' : t === 17 ? '17+' : String(t))
export const softLabel = (t) => `A,${t - 11}`
export const pairLabel = (r) => (r === 1 ? 'A,A' : `${r},${r}`)

const tableCache = new Map()

/**
 * Tokens: H hit, S stand, D double else hit, Ds double else stand, P split,
 * Rh surrender else hit, '-' do not split (fall through to hard/soft totals).
 * Differences by deck count: 1 deck and 2 decks double a few more hands.
 */
export function getTables(decks) {
  const tier = decks <= 1 ? 1 : decks === 2 ? 2 : 4
  if (tableCache.has(tier)) return tableCache.get(tier)
  const lowDeck = tier <= 2
  const single = tier === 1

  const hard = {
    8: row(single ? 'H H H D D H H H H H' : 'H H H H H H H H H H'),
    9: row(lowDeck ? 'D D D D D H H H H H' : 'H D D D D H H H H H'),
    10: row('D D D D D D D D H H'),
    11: row(lowDeck ? 'D D D D D D D D D D' : 'D D D D D D D D D H'),
    12: row('H H S S S H H H H H'),
    13: row('S S S S S H H H H H'),
    14: row('S S S S S H H H H H'),
    15: row('S S S S S H H H Rh H'),
    16: row('S S S S S H H Rh Rh Rh'),
    17: row('S S S S S S S S S S'),
  }
  const soft = {
    13: row('H H H D D H H H H H'),
    14: row('H H H D D H H H H H'),
    15: row('H H D D D H H H H H'),
    16: row('H H D D D H H H H H'),
    17: row(single ? 'D D D D D H H H H H' : 'H D D D D H H H H H'),
    18: row('S Ds Ds Ds Ds S S H H H'),
    19: row('S S S S S S S S S S'),
    20: row('S S S S S S S S S S'),
  }
  const pairs = {
    1: row('P P P P P P P P P P'),
    2: row('P P P P P P - - - -'),
    3: row('P P P P P P - - - -'),
    4: row('- - - P P - - - - -'),
    5: row('- - - - - - - - - -'),
    6: row('P P P P P - - - - -'),
    7: row('P P P P P P - - - -'),
    8: row('P P P P P P P P P P'),
    9: row('P P P P P - P P - -'),
    10: row('- - - - - - - - - -'),
  }
  const t = { hard, soft, pairs }
  tableCache.set(tier, t)
  return t
}

const ACTION_BY_TOKEN = { H: 'hit', S: 'stand', D: 'double', Ds: 'double', P: 'split', Rh: 'surrender' }

function resolveToken(token, { canDouble, canSurrender }) {
  switch (token) {
    case 'H':
      return 'hit'
    case 'S':
      return 'stand'
    case 'D':
      return canDouble ? 'double' : 'hit'
    case 'Ds':
      return canDouble ? 'double' : 'stand'
    case 'Rh':
      return canSurrender ? 'surrender' : 'hit'
    case 'P':
      return 'split'
    default:
      return 'hit'
  }
}

/**
 * Basic strategy lookup.
 * ctx: { cards, up, decks, canSplit, canDouble, canSurrender }
 * Returns { action, token, section: 'pairs'|'soft'|'hard', row, col }
 */
export function basicStrategy({ cards, up, decks = 6, canSplit = false, canDouble = false, canSurrender = false }) {
  const ranks = cards.map(rankOf)
  const col = colIndex(up)
  const T = getTables(decks)
  const ctx = { canDouble, canSurrender }

  if (canSplit && isPair(ranks)) {
    const token = T.pairs[ranks[0]][col]
    if (token === 'P') return { action: 'split', token, section: 'pairs', row: ranks[0], col }
  }

  const hv = handValue(ranks)
  if (hv.soft) {
    if (hv.total >= 21) return { action: 'stand', token: 'S', section: 'soft', row: 20, col }
    const rowTable = T.soft[hv.total]
    if (!rowTable) return { action: 'hit', token: 'H', section: 'soft', row: 13, col }
    const token = rowTable[col]
    return { action: resolveToken(token, ctx), token, section: 'soft', row: hv.total, col }
  }

  const key = hv.total <= 8 ? 8 : hv.total >= 17 ? 17 : hv.total
  const token = T.hard[key][col]
  return { action: resolveToken(token, ctx), token, section: 'hard', row: key, col }
}

const dev = (kind, total, up, index, hi, lo, extra = {}) => ({ kind, total, up, index, hi, lo, ...extra })

/**
 * Hi-Lo index plays. `hi` is played when TC >= index, otherwise `lo`.
 * Indices are for S17 multi-deck play (the common published values).
 */
export const DEVIATIONS = [
  // Illustrious 18 (insurance is handled separately)
  dev('hard', 16, 10, 0, 'stand', 'hit', { noSurrender: true, group: 'I18' }),
  dev('hard', 15, 10, 4, 'stand', 'hit', { noSurrender: true, group: 'I18' }),
  dev('pair', 20, 5, 5, 'split', 'stand', { group: 'I18' }),
  dev('pair', 20, 6, 4, 'split', 'stand', { group: 'I18' }),
  dev('hard', 10, 10, 4, 'double', 'hit', { group: 'I18' }),
  dev('hard', 12, 3, 2, 'stand', 'hit', { group: 'I18' }),
  dev('hard', 12, 2, 3, 'stand', 'hit', { group: 'I18' }),
  dev('hard', 11, 1, 1, 'double', 'hit', { minDecks: 4, group: 'I18' }),
  dev('hard', 9, 2, 1, 'double', 'hit', { minDecks: 4, group: 'I18' }),
  dev('hard', 10, 1, 4, 'double', 'hit', { group: 'I18' }),
  dev('hard', 9, 7, 3, 'double', 'hit', { group: 'I18' }),
  dev('hard', 16, 9, 5, 'stand', 'hit', { noSurrender: true, group: 'I18' }),
  dev('hard', 13, 2, -1, 'stand', 'hit', { group: 'I18' }),
  dev('hard', 12, 4, 0, 'stand', 'hit', { group: 'I18' }),
  dev('hard', 12, 5, -2, 'stand', 'hit', { group: 'I18' }),
  dev('hard', 12, 6, -1, 'stand', 'hit', { group: 'I18' }),
  dev('hard', 13, 3, -2, 'stand', 'hit', { group: 'I18' }),
  // Fab 4 surrender deviations
  dev('hard', 14, 10, 3, 'surrender', 'hit', { needsSurrender: true, group: 'Fab4' }),
  dev('hard', 15, 10, 0, 'surrender', 'hit', { needsSurrender: true, group: 'Fab4' }),
  dev('hard', 15, 9, 2, 'surrender', 'hit', { needsSurrender: true, group: 'Fab4' }),
  dev('hard', 15, 1, 1, 'surrender', 'hit', { needsSurrender: true, group: 'Fab4' }),
]

export const INSURANCE_INDEX = 3
/** Take insurance at TC >= +3. */
export const shouldTakeInsurance = (tc) => tc >= INSURANCE_INDEX

function legalize(action, { canDouble, canSplit, canSurrender }) {
  if (action === 'double' && !canDouble) return 'hit'
  if (action === 'split' && !canSplit) return 'hit'
  if (action === 'surrender' && !canSurrender) return 'hit'
  return action
}

/**
 * Full recommendation: basic strategy, then count-based deviations when TC calls for them.
 * Returns { action, source: 'basic'|'deviation', baseAction, section, row, col, deviation?, watch? }
 */
export function recommend(ctx) {
  const { cards, up, decks = 6, canSplit = false, canDouble = false, canSurrender = false, tc } = ctx
  const base = basicStrategy(ctx)
  const result = { ...base, baseAction: base.action, source: 'basic' }
  if (typeof tc !== 'number' || Number.isNaN(tc)) return result

  const ranks = cards.map(rankOf)
  const hv = handValue(ranks)
  const legal = { canDouble, canSplit, canSurrender }

  for (const d of DEVIATIONS) {
    if (d.up !== up) continue
    if (d.minDecks && decks < d.minDecks) continue
    if (d.noSurrender && canSurrender) continue
    if (d.needsSurrender && !canSurrender) continue
    const matches =
      d.kind === 'pair'
        ? canSplit && isPair(ranks) && ranks[0] === 10
        : !hv.soft && hv.total === d.total && !(d.kind === 'hard' && canSplit && isPair(ranks) && base.action === 'split')
    if (!matches) continue

    const wanted = tc >= d.index ? d.hi : d.lo
    const action = legalize(wanted, legal)
    const active = tc >= d.index
    if (action !== base.action) {
      return { ...result, action, source: 'deviation', deviation: { ...d, tc, active } }
    }
    return { ...result, watch: { ...d } }
  }
  return result
}

/** "Hard 16", "Soft 18" or "Pair of 8s". */
export function describeHand(cards, canSplit = false) {
  const ranks = cards.map(rankOf)
  const hv = handValue(ranks)
  if (canSplit && isPair(ranks)) {
    const r = ranks[0]
    return r === 1 ? 'Pair of Aces' : `Pair of ${r}s`
  }
  return `${hv.soft ? 'Soft' : 'Hard'} ${hv.total}`
}

export { ACTION_BY_TOKEN }
