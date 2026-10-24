import { describe, it, expect } from 'vitest'
import { fullComposition, makeCard } from './cards.js'
import { buildComposition, dealerDistribution, standOutcome, analyzeHand, insuranceInfo } from './probability.js'

const sum = (a) => a.reduce((x, y) => x + y, 0)
const shoe6 = () => fullComposition(6)
const cards = (...v) => v.map((x) => makeCard(x))

describe('dealerDistribution', () => {
  it('sums to 1 for every upcard', () => {
    for (let up = 1; up <= 10; up++) {
      const d = dealerDistribution(shoe6(), up)
      expect(sum(d.p) + d.bust).toBeCloseTo(1, 9)
    }
  })

  it('busts about 42% of the time on a 6 and rarely on strong cards', () => {
    const six = dealerDistribution(shoe6(), 6).bust
    expect(six).toBeGreaterThan(0.4)
    expect(six).toBeLessThan(0.44)
    expect(dealerDistribution(shoe6(), 10).bust).toBeLessThan(0.25)
    expect(dealerDistribution(shoe6(), 1).bust).toBeLessThan(0.2)
  })

  it('responds to the remaining shoe composition', () => {
    const full = dealerDistribution(shoe6(), 6)
    // remove 40 tens: the dealer busts less because tens are what bust a stiff hand
    const seen = new Array(11).fill(0)
    seen[10] = 40
    const poorInTens = dealerDistribution(buildComposition(6, seen), 6)
    expect(poorInTens.bust).toBeLessThan(full.bust)
  })
})

describe('standOutcome', () => {
  it('compares a stand value with the dealer distribution', () => {
    const d = { p: [0.2, 0.2, 0.2, 0.1, 0.1], bust: 0.2 }
    const o = standOutcome(19, d)
    expect(o.w).toBeCloseTo(0.2 + 0.4, 9) // bust + 17 + 18
    expect(o.p).toBeCloseTo(0.2, 9)
    expect(o.l).toBeCloseTo(0.2, 9)
    expect(o.ev).toBeCloseTo(0.4, 9)
    expect(standOutcome(12, d).w).toBeCloseTo(0.2, 9) // only a dealer bust beats 12
  })
})

describe('analyzeHand', () => {
  const analyze = (hand, up, extra = {}, comp = shoe6()) =>
    analyzeHand({ cards: cards(...hand), up, comp, canDouble: true, canSplit: false, canSurrender: true, ...extra })

  it('win + push + loss = 1 for each action', () => {
    const r = analyze(['10', '6'], 10)
    for (const o of Object.values(r.actions)) {
      if (o.l === 1 && o.w === 0) continue // surrender
      expect(o.w + o.p + o.l).toBeCloseTo(1, 4)
    }
  })

  it('standing on 20 vs 6 is a big favourite', () => {
    const r = analyze(['10', 'K'], 6)
    expect(r.actions.stand.ev).toBeGreaterThan(0.6)
    expect(r.best).toBe('stand')
  })

  it('doubling 11 vs 6 is best', () => {
    const r = analyze(['6', '5'], 6)
    expect(r.best).toBe('double')
    expect(r.actions.double.ev).toBeGreaterThan(r.actions.hit.ev)
  })

  it('16 vs 10: surrender (-0.5) beats playing it out', () => {
    const r = analyze(['10', '6'], 10)
    expect(r.actions.surrender.ev).toBe(-0.5)
    expect(r.best).toBe('surrender')
    expect(r.actions.stand.ev).toBeLessThan(-0.5)
  })

  it('splitting Aces beats hitting soft 12', () => {
    const r = analyze(['A', 'A'], 6, { canSplit: true })
    expect(r.actions.split).toBeDefined()
    expect(r.best).toBe('split')
  })

  it('splitting 8s vs 6 beats standing on 16', () => {
    const r = analyze(['8', '8'], 6, { canSplit: true })
    expect(r.actions.split.ev).toBeGreaterThan(r.actions.stand.ev)
    expect(r.best).toBe('split')
  })

  it('only offers legal actions', () => {
    const r = analyze(['10', '6'], 10, { canDouble: false, canSplit: false, canSurrender: false })
    expect(Object.keys(r.actions).sort()).toEqual(['hit', 'stand'])
  })

  it('a ten-rich shoe makes 12 vs 4 hitting worse (the count deviation)', () => {
    const seenLow = new Array(11).fill(0)
    seenLow[2] = 18
    seenLow[3] = 18
    seenLow[4] = 18
    seenLow[5] = 18
    seenLow[6] = 18 // many small cards gone -> ten-rich
    const rich = analyze(['10', '2'], 4, { canSurrender: false }, buildComposition(6, seenLow))
    const base = analyze(['10', '2'], 4, { canSurrender: false })
    expect(rich.actions.hit.ev - rich.actions.stand.ev).toBeLessThan(base.actions.hit.ev - base.actions.stand.ev)
  })

  it('stays fast enough for a low starting total on 8 decks', () => {
    const t = Date.now()
    const r = analyze(['2', '3'], 6, {}, fullComposition(8))
    expect(Date.now() - t).toBeLessThan(5000)
    expect(r.actions.hit.ev).toBeGreaterThan(-0.5)
  })
})

describe('insuranceInfo', () => {
  it('is a losing bet in a fresh shoe and a winning one when tens are plentiful', () => {
    expect(insuranceInfo(shoe6()).ev).toBeLessThan(0)
    const rich = shoe6()
    rich[2] = 0
    rich[3] = 0
    rich[4] = 0
    rich[5] = 0
    expect(insuranceInfo(rich).ev).toBeGreaterThan(0)
  })
})
