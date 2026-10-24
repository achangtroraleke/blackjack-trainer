import { describe, it, expect } from 'vitest'
import { makeCard } from './cards.js'
import { basicStrategy, recommend, shouldTakeInsurance, getTables, describeHand } from './strategy.js'

const cards = (...v) => v.map((x) => makeCard(x))
const full = { canDouble: true, canSplit: false, canSurrender: true }
const act = (hand, up, extra = {}) => basicStrategy({ cards: cards(...hand), up, decks: 6, ...full, ...extra }).action

describe('basic strategy: hard totals', () => {
  it('hits low totals and stands on 17+', () => {
    expect(act(['5', '2'], 10)).toBe('hit')
    expect(act(['10', '7'], 10)).toBe('stand')
    expect(act(['10', '8'], 1)).toBe('stand')
  })

  it('12-16 stand against 2-6 (12 hits vs 2 and 3)', () => {
    expect(act(['10', '2'], 2)).toBe('hit')
    expect(act(['10', '2'], 3)).toBe('hit')
    expect(act(['10', '2'], 4)).toBe('stand')
    expect(act(['10', '4'], 2)).toBe('stand')
    expect(act(['10', '4'], 7)).toBe('hit')
  })

  it('doubles 10 and 11 against weak cards', () => {
    expect(act(['6', '4'], 9)).toBe('double')
    expect(act(['6', '4'], 10)).toBe('hit')
    expect(act(['6', '5'], 6)).toBe('double')
    expect(act(['6', '5'], 1)).toBe('hit') // 4+ decks, S17
  })

  it('falls back to hit when doubling is not allowed', () => {
    expect(act(['6', '5'], 6, { canDouble: false })).toBe('hit')
    expect(act(['6', '3'], 5, { canDouble: false })).toBe('hit')
  })

  it('late surrender: 16 vs 9/10/A and 15 vs 10', () => {
    expect(act(['10', '6'], 10)).toBe('surrender')
    expect(act(['10', '6'], 9)).toBe('surrender')
    expect(act(['10', '6'], 1)).toBe('surrender')
    expect(act(['10', '5'], 10)).toBe('surrender')
    expect(act(['10', '6'], 10, { canSurrender: false })).toBe('hit')
    expect(act(['10', '7'], 1)).toBe('stand') // 17 vs A: stand (S17)
  })

  it('1 and 2 decks double a few more hands', () => {
    const one = (hand, up) => basicStrategy({ cards: cards(...hand), up, decks: 1, ...full }).action
    expect(one(['6', '5'], 1)).toBe('double')
    expect(one(['5', '4'], 2)).toBe('double')
    expect(act(['5', '4'], 2)).toBe('hit')
  })
})

describe('basic strategy: soft totals', () => {
  it('soft 13-17 double against 5-6 and up to 4-6 for higher softs', () => {
    expect(act(['A', '2'], 5)).toBe('double')
    expect(act(['A', '2'], 4)).toBe('hit')
    expect(act(['A', '6'], 3)).toBe('double')
    expect(act(['A', '6'], 7)).toBe('hit')
  })

  it('soft 18: stand vs 2, 7, 8; double (else stand) vs 3-6; hit vs 9, 10, A', () => {
    expect(act(['A', '7'], 2)).toBe('stand')
    expect(act(['A', '7'], 6)).toBe('double')
    expect(act(['A', '7'], 6, { canDouble: false })).toBe('stand')
    expect(act(['A', '7'], 8)).toBe('stand')
    expect(act(['A', '7'], 9)).toBe('hit')
    expect(act(['A', '7'], 1)).toBe('hit')
  })

  it('soft 19+ stands', () => {
    expect(act(['A', '8'], 6)).toBe('stand')
    expect(act(['A', '9'], 10)).toBe('stand')
  })
})

describe('basic strategy: pairs', () => {
  const pair = (r, up) => basicStrategy({ cards: cards(r, r), up, decks: 6, canDouble: true, canSplit: true, canSurrender: true }).action

  it('always split Aces and 8s; never 5s or 10s', () => {
    expect(pair('A', 10)).toBe('split')
    expect(pair('8', 10)).toBe('split')
    expect(pair('8', 1)).toBe('split')
    expect(pair('5', 6)).toBe('double') // plays as hard 10
    expect(pair('10', 6)).toBe('stand')
  })

  it('9s split except vs 7, 10, A', () => {
    expect(pair('9', 6)).toBe('split')
    expect(pair('9', 8)).toBe('split')
    expect(pair('9', 7)).toBe('stand')
    expect(pair('9', 10)).toBe('stand')
  })

  it('uses the total when splitting is not allowed', () => {
    expect(act(['8', '8'], 10, { canSplit: false })).toBe('surrender')
    expect(act(['A', 'A'], 6, { canSplit: false })).toBe('hit') // soft 12 is not a doubling hand
  })

  it('small pairs and 7s', () => {
    expect(pair('2', 7)).toBe('split')
    expect(pair('2', 8)).toBe('hit')
    expect(pair('7', 7)).toBe('split')
    expect(pair('7', 8)).toBe('hit')
    expect(pair('6', 6)).toBe('split')
    expect(pair('6', 7)).toBe('hit')
    expect(pair('4', 5)).toBe('split')
    expect(pair('4', 7)).toBe('hit')
  })
})

describe('count-based deviations', () => {
  const rec = (hand, up, tc, extra = {}) => recommend({ cards: cards(...hand), up, decks: 6, tc, ...full, ...extra })

  it('16 vs 10 (no surrender): stand at TC >= 0, hit below', () => {
    expect(rec(['10', '6'], 10, 0, { canSurrender: false }).action).toBe('stand')
    expect(rec(['10', '6'], 10, -1, { canSurrender: false }).action).toBe('hit')
    expect(rec(['10', '6'], 10, 2, { canSurrender: false }).source).toBe('deviation')
  })

  it('with surrender available 16 vs 10 stays a surrender', () => {
    expect(rec(['10', '6'], 10, 3).action).toBe('surrender')
  })

  it('12 vs 3 stands at TC >= +2 and 12 vs 4 hits below 0', () => {
    expect(rec(['10', '2'], 3, 2).action).toBe('stand')
    expect(rec(['10', '2'], 3, 1.9).action).toBe('hit')
    expect(rec(['10', '2'], 4, 0).action).toBe('stand')
    expect(rec(['10', '2'], 4, -0.5).action).toBe('hit')
  })

  it('10 vs 10 doubles at TC >= +4', () => {
    expect(rec(['6', '4'], 10, 4).action).toBe('double')
    expect(rec(['6', '4'], 10, 3.9).action).toBe('hit')
    expect(rec(['6', '4'], 10, 4, { canDouble: false }).action).toBe('hit')
  })

  it('11 vs A doubles at TC >= +1 (multi-deck)', () => {
    expect(rec(['6', '5'], 1, 1).action).toBe('double')
    expect(rec(['6', '5'], 1, 0.9).action).toBe('hit')
  })

  it('splits tens vs 5 at +5 and vs 6 at +4', () => {
    const r = (up, tc) => recommend({ cards: cards('K', 'Q'), up, decks: 6, tc, canDouble: true, canSplit: true, canSurrender: true }).action
    expect(r(5, 5)).toBe('split')
    expect(r(5, 4.9)).toBe('stand')
    expect(r(6, 4)).toBe('split')
    expect(r(6, 3.9)).toBe('stand')
  })

  it('Fab 4 surrenders: 14 vs 10 at +3, 15 vs 10 at 0, 15 vs 9 at +2, 15 vs A at +1', () => {
    expect(rec(['10', '4'], 10, 3).action).toBe('surrender')
    expect(rec(['10', '4'], 10, 2.9).action).toBe('hit')
    expect(rec(['10', '5'], 10, 0).action).toBe('surrender')
    expect(rec(['10', '5'], 10, -1).action).toBe('hit')
    expect(rec(['10', '5'], 9, 2).action).toBe('surrender')
    expect(rec(['10', '5'], 9, 1).action).toBe('hit')
    expect(rec(['10', '5'], 1, 1).action).toBe('surrender')
    expect(rec(['10', '5'], 1, 0).action).toBe('hit')
  })

  it('stays on basic strategy when no deviation applies', () => {
    const r = rec(['10', '7'], 6, 5)
    expect(r.action).toBe('stand')
    expect(r.source).toBe('basic')
  })

  it('takes insurance at TC >= +3', () => {
    expect(shouldTakeInsurance(3)).toBe(true)
    expect(shouldTakeInsurance(2.9)).toBe(false)
    expect(shouldTakeInsurance(-2)).toBe(false)
  })
})

describe('helpers', () => {
  it('describes hands', () => {
    expect(describeHand(cards('A', '7'))).toBe('Soft 18')
    expect(describeHand(cards('10', '6'))).toBe('Hard 16')
    expect(describeHand(cards('8', '8'), true)).toBe('Pair of 8s')
    expect(describeHand(cards('A', 'A'), true)).toBe('Pair of Aces')
  })

  it('every table row has 10 dealer columns', () => {
    for (const decks of [1, 2, 6]) {
      const T = getTables(decks)
      for (const section of Object.values(T)) for (const row of Object.values(section)) expect(row).toHaveLength(10)
    }
  })
})
