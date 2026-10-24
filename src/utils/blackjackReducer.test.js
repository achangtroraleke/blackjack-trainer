import { describe, it, expect } from 'vitest'
import { makeCard } from './cards.js'
import { reducer, initialGame, getLegal } from './blackjackReducer.js'

const c = (v) => makeCard(v)
const run = (state, ...actions) => actions.reduce((s, a) => reducer(s, a), state)
// DEAL order: player, dealer up, player, dealer hole
const deal = (bet, p1, up, p2, hole, state = initialGame(1000)) =>
  reducer(state, { type: 'DEAL', bet, cards: [c(p1), c(up), c(p2), c(hole)], tc: 0 })

describe('dealing and naturals', () => {
  it('pays 3:2 for a player blackjack', () => {
    const s = deal(100, 'A', '9', 'K', '7')
    expect(s.phase).toBe('settled')
    expect(s.hands[0].outcome).toBe('blackjack')
    expect(s.bankroll).toBe(1150)
    expect(s.summary.profit).toBe(150)
    expect(s.dealer.hidden).toBe(false)
  })

  it('dealer blackjack (ten up) ends the hand immediately', () => {
    const s = deal(100, '10', 'K', '9', 'A')
    expect(s.phase).toBe('settled')
    expect(s.hands[0].outcome).toBe('loss')
    expect(s.bankroll).toBe(900)
  })

  it('both blackjack is a push', () => {
    const s = deal(100, 'A', 'K', 'K', 'A')
    expect(s.hands[0].outcome).toBe('push')
    expect(s.bankroll).toBe(1000)
  })

  it('offers insurance on an Ace; decline then dealer blackjack loses the bet', () => {
    const s = deal(100, '10', 'A', '9', 'K')
    expect(s.phase).toBe('insurance')
    const r = reducer(s, { type: 'INSURANCE', take: false })
    expect(r.phase).toBe('settled')
    expect(r.bankroll).toBe(900)
  })

  it('insurance pays 2:1 and breaks even against dealer blackjack', () => {
    const r = run(deal(100, '10', 'A', '9', 'K'), { type: 'INSURANCE', take: true })
    expect(r.insurance.result).toBe('won')
    expect(r.bankroll).toBe(1000)
  })

  it('insurance is lost when the dealer has no blackjack', () => {
    const r = run(deal(100, '10', 'A', '9', '6'), { type: 'INSURANCE', take: true })
    expect(r.phase).toBe('player')
    expect(r.insurance.taken).toBe(true)
    expect(r.bankroll).toBe(850) // 100 bet + 50 insurance
  })
})

describe('player actions', () => {
  it('hit to bust loses without the dealer drawing', () => {
    const r = run(deal(100, '10', '10', '6', '7'), { type: 'HIT', card: c('10') })
    expect(r.phase).toBe('settled')
    expect(r.hands[0].outcome).toBe('bust')
    expect(r.bankroll).toBe(900)
    expect(r.dealer.hidden).toBe(false)
  })

  it('stand then a dealer bust wins 1:1', () => {
    const r = run(
      deal(100, '10', '10', '9', '6'),
      { type: 'STAND' },
      { type: 'REVEAL' },
      { type: 'DEALER_DRAW', card: c('10') },
      { type: 'SETTLE' },
    )
    expect(r.hands[0].outcome).toBe('win')
    expect(r.bankroll).toBe(1100)
  })

  it('dealer stands on soft 17 (push at 17)', () => {
    const r = run(deal(100, '10', 'A', '7', '6'), { type: 'INSURANCE', take: false }, { type: 'STAND' }, { type: 'SETTLE' })
    // dealer A+6 = soft 17 stands, player 17 pushes
    expect(r.hands[0].outcome).toBe('push')
    expect(r.bankroll).toBe(1000)
  })

  it('auto-stands on 21', () => {
    const r = run(deal(100, '10', '6', '5', '10'), { type: 'HIT', card: c('6') })
    expect(r.phase).toBe('dealer')
    expect(r.hands[0].done).toBe(true)
  })

  it('double takes one card, doubles the bet and ends the hand', () => {
    const r = run(
      deal(100, '5', '6', '6', '10'),
      { type: 'DOUBLE', card: c('10') },
      { type: 'REVEAL' },
      { type: 'DEALER_DRAW', card: c('10') },
      { type: 'SETTLE' },
    )
    expect(r.hands[0].bet).toBe(200)
    expect(r.hands[0].outcome).toBe('win')
    expect(r.bankroll).toBe(1200)
  })

  it('late surrender returns half the bet', () => {
    const s = deal(100, '10', '10', '6', '7')
    expect(getLegal(s).surrender).toBe(true)
    const r = reducer(s, { type: 'SURRENDER' })
    expect(r.phase).toBe('settled')
    expect(r.summary.result).toBe('surrender')
    expect(r.bankroll).toBe(950)
  })

  it('cannot surrender after hitting', () => {
    const s = run(deal(100, '2', '10', '3', '7'), { type: 'HIT', card: c('2') })
    expect(getLegal(s).surrender).toBe(false)
    expect(getLegal(s).double).toBe(false)
  })
})

describe('splitting', () => {
  it('splits a pair into two hands (once) and charges a second bet', () => {
    const s = deal(100, '8', '6', '8', '10')
    expect(getLegal(s).split).toBe(true)
    const r = reducer(s, { type: 'SPLIT', card: c('3') })
    expect(r.hands).toHaveLength(2)
    expect(r.hands[0].cards.map((x) => x.rank)).toEqual([8, 3])
    expect(r.hands[1].cards).toHaveLength(1)
    expect(r.bankroll).toBe(800)
    expect(r.active).toBe(0)
    expect(getLegal(r).split).toBe(false) // split once only
  })

  it('moves to the second hand, which receives its second card later; double after split is allowed', () => {
    let r = run(deal(100, '8', '6', '8', '10'), { type: 'SPLIT', card: c('3') }, { type: 'HIT', card: c('10') })
    // 8+3+10 = 21 -> auto stand, second hand becomes active with one card
    expect(r.active).toBe(1)
    expect(getLegal(r).hit).toBe(false) // waiting for its second card
    r = reducer(r, { type: 'DEAL_SECOND', card: c('3') })
    expect(r.hands[1].cards).toHaveLength(2)
    expect(getLegal(r).double).toBe(true)
    r = reducer(r, { type: 'DOUBLE', card: c('10') })
    expect(r.hands[1].bet).toBe(200)
    expect(r.bankroll).toBe(700)
    expect(r.phase).toBe('dealer')
  })

  it('split aces get one card each and a 21 is not a blackjack', () => {
    let r = run(deal(100, 'A', '10', 'A', '7'), { type: 'SPLIT', card: c('K') })
    expect(r.hands[0].done).toBe(true)
    expect(r.active).toBe(1)
    r = reducer(r, { type: 'DEAL_SECOND', card: c('5') })
    expect(r.phase).toBe('dealer')
    r = run(r, { type: 'REVEAL' }, { type: 'SETTLE' })
    expect(r.hands[0].outcome).toBe('win') // 21 vs 17 pays 1:1, not 3:2
    expect(r.hands[1].outcome).toBe('loss') // soft 16 vs 17
    expect(r.bankroll).toBe(1000 - 200 + 200)
  })

  it('cannot split a non-pair or without enough chips', () => {
    expect(getLegal(deal(100, '8', '6', '9', '10')).split).toBe(false)
    expect(getLegal(deal(100, '8', '6', '8', '10', initialGame(150))).split).toBe(false)
  })
})

describe('settlement', () => {
  it('compares totals for win, loss and push', () => {
    const play = (p1, p2, up, hole) =>
      run(deal(100, p1, up, p2, hole), { type: 'STAND' }, { type: 'REVEAL' }, { type: 'SETTLE' }).hands[0].outcome
    expect(play('10', '9', '10', '8')).toBe('win')
    expect(play('10', '8', '10', '9')).toBe('loss')
    expect(play('10', '9', '10', '9')).toBe('push')
  })
})
