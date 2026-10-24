import { describe, it, expect } from 'vitest'
import {
  rankFromValue,
  normalizeCard,
  makeCard,
  handValue,
  isBlackjack,
  isPair,
  hiLoValue,
  runningCount,
  trueCount,
  decksRemaining,
  fullComposition,
  suggestedUnits,
} from './cards.js'

const hand = (...vals) => vals.map((v) => makeCard(v))

describe('card values', () => {
  it('maps API values to ranks (Ace = 1, faces = 10)', () => {
    expect(rankFromValue('ACE')).toBe(1)
    expect(rankFromValue('KING')).toBe(10)
    expect(rankFromValue('QUEEN')).toBe(10)
    expect(rankFromValue('JACK')).toBe(10)
    expect(rankFromValue('10')).toBe(10)
    expect(rankFromValue('7')).toBe(7)
    expect(() => rankFromValue('JOKER')).toThrow()
  })

  it('normalizes an API card', () => {
    const c = normalizeCard({ code: 'KH', image: 'x.png', value: 'KING', suit: 'HEARTS' })
    expect(c).toMatchObject({ code: 'KH', rank: 10, suit: 'HEARTS', image: 'x.png' })
  })
})

describe('handValue', () => {
  it('sums hard hands', () => {
    expect(handValue(hand('10', '7'))).toMatchObject({ total: 17, soft: false, bust: false })
    expect(handValue(hand('K', 'Q', '5'))).toMatchObject({ total: 25, bust: true })
  })

  it('treats one Ace as 11 when it does not bust (soft)', () => {
    expect(handValue(hand('A', '6'))).toMatchObject({ total: 17, soft: true })
    expect(handValue(hand('A', 'A'))).toMatchObject({ total: 12, soft: true })
    expect(handValue(hand('A', '6', '4'))).toMatchObject({ total: 21, soft: true })
  })

  it('demotes the Ace to 1 when needed (becomes hard)', () => {
    expect(handValue(hand('A', '6', '10'))).toMatchObject({ total: 17, hard: 17, soft: false })
    expect(handValue(hand('A', 'A', '9'))).toMatchObject({ total: 21, soft: true })
    expect(handValue(hand('A', 'A', '9', '5'))).toMatchObject({ total: 16, soft: false })
  })

  it('accepts raw ranks', () => {
    expect(handValue([1, 10]).total).toBe(21)
  })

  it('detects blackjack and pairs', () => {
    expect(isBlackjack(hand('A', 'K'))).toBe(true)
    expect(isBlackjack(hand('7', '7', '7'))).toBe(false)
    expect(isPair(hand('8', '8'))).toBe(true)
    expect(isPair(hand('K', 'Q'))).toBe(true) // equal value
    expect(isPair(hand('9', '8'))).toBe(false)
  })
})

describe('Hi-Lo counting', () => {
  it('assigns +1 / 0 / -1', () => {
    for (const v of ['2', '3', '4', '5', '6']) expect(hiLoValue(makeCard(v))).toBe(1)
    for (const v of ['7', '8', '9']) expect(hiLoValue(makeCard(v))).toBe(0)
    for (const v of ['10', 'J', 'Q', 'K', 'A']) expect(hiLoValue(makeCard(v))).toBe(-1)
  })

  it('sums a sequence', () => {
    expect(runningCount(hand('2', 'K', '5', '9', 'A', '6'))).toBe(1) // +1 -1 +1 0 -1 +1
  })

  it('a full deck balances to zero', () => {
    const comp = fullComposition(1)
    let sum = 0
    for (let r = 1; r <= 10; r++) sum += comp[r] * hiLoValue(r)
    expect(sum).toBe(0)
    expect(comp.slice(1).reduce((a, b) => a + b, 0)).toBe(52)
  })

  it('scales composition by deck count', () => {
    const c = fullComposition(6)
    expect(c[1]).toBe(24)
    expect(c[10]).toBe(96)
  })
})

describe('true count', () => {
  it('divides the running count by decks remaining, rounded to 1 decimal', () => {
    expect(decksRemaining(156)).toBe(3)
    expect(trueCount(6, 156)).toBe(2)
    expect(trueCount(5, 156)).toBe(1.7)
    expect(trueCount(-4, 104)).toBe(-2)
    expect(trueCount(3, 78)).toBe(2) // 1.5 decks left
    expect(trueCount(3, 26)).toBe(6) // half a deck left
  })

  it('handles an empty shoe and never returns -0', () => {
    expect(trueCount(5, 0)).toBe(0)
    expect(Object.is(trueCount(0, 100), 0)).toBe(true)
    expect(Object.is(trueCount(-0.1, 1000), 0)).toBe(true)
  })
})

describe('bet spread', () => {
  it('1 unit at TC <= 1, up to 8 units at TC >= 5', () => {
    expect(suggestedUnits(-3)).toBe(1)
    expect(suggestedUnits(1.9)).toBe(1)
    expect(suggestedUnits(2)).toBe(2)
    expect(suggestedUnits(3.4)).toBe(4)
    expect(suggestedUnits(4)).toBe(6)
    expect(suggestedUnits(5)).toBe(8)
    expect(suggestedUnits(9)).toBe(8)
  })
})
