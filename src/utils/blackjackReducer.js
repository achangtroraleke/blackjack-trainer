// Pure game state machine for the blackjack table.
//
// Rules: dealer stands on soft 17 and peeks for blackjack, blackjack pays 3:2, double after
// split allowed, split once (max 2 hands), split aces receive one card each, late surrender.
//
// Phases: betting -> (insurance) -> player -> dealer -> settled -> betting ...

import { handValue, isBlackjack, isPair } from './cards.js'

export const MIN_BET = 5
export const MAX_BET = 500
export const START_BANKROLL = 1000

const newHand = (cards, bet, extra = {}) => ({
  cards,
  bet,
  doubled: false,
  split: false,
  aces: false,
  done: false,
  bust: false,
  surrendered: false,
  outcome: null,
  payout: 0,
  ...extra,
})

export const initialGame = (bankroll = START_BANKROLL) => ({
  phase: 'betting',
  roundId: 0,
  bankroll,
  lastBet: 0,
  hands: [],
  active: 0,
  dealer: { cards: [], hidden: true },
  insurance: { offered: false, taken: false, bet: 0, payout: 0, result: null },
  message: '',
  summary: null,
  startTc: 0,
  decisions: { total: 0, correct: 0, followed: true },
  feedback: null,
})

const isAceUp = (s) => s.dealer.cards[0]?.rank === 1
const isTenUp = (s) => s.dealer.cards[0]?.rank === 10

/** Which actions are legal right now. */
export function getLegal(state) {
  const none = { hit: false, stand: false, double: false, split: false, surrender: false }
  if (state.phase !== 'player') return none
  const h = state.hands[state.active]
  if (!h || h.done || h.cards.length < 2) return none
  const canAfford = state.bankroll >= h.bet
  return {
    hit: true,
    stand: true,
    double: h.cards.length === 2 && canAfford,
    split: state.hands.length === 1 && isPair(h.cards) && canAfford,
    surrender: state.hands.length === 1 && !h.split && h.cards.length === 2,
  }
}

export const canOfferInsurance = (state) => state.phase === 'insurance' && state.bankroll >= state.hands[0].bet / 2

const OUTCOME_TEXT = {
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
  blackjack: 'Blackjack!',
  bust: 'Bust',
  surrender: 'Surrender',
}
export const outcomeLabel = (o) => OUTCOME_TEXT[o] || ''

function settle(state, { dealerBlackjack = false } = {}) {
  const dealerCards = state.dealer.cards
  const dv = handValue(dealerCards)
  const dealerBJ = dealerBlackjack || isBlackjack(dealerCards)

  let bankroll = state.bankroll
  let totalBet = 0
  let totalPayout = 0
  const hands = state.hands.map((h) => {
    const v = handValue(h.cards)
    const natural = !h.split && h.cards.length === 2 && v.total === 21
    let outcome
    let payout
    if (h.surrendered) {
      outcome = 'surrender'
      payout = h.bet * 0.5
    } else if (v.total > 21) {
      outcome = 'bust'
      payout = 0
    } else if (natural && dealerBJ) {
      outcome = 'push'
      payout = h.bet
    } else if (natural) {
      outcome = 'blackjack'
      payout = h.bet * 2.5
    } else if (dealerBJ) {
      outcome = 'loss'
      payout = 0
    } else if (dv.total > 21) {
      outcome = 'win'
      payout = h.bet * 2
    } else if (v.total > dv.total) {
      outcome = 'win'
      payout = h.bet * 2
    } else if (v.total === dv.total) {
      outcome = 'push'
      payout = h.bet
    } else {
      outcome = 'loss'
      payout = 0
    }
    totalBet += h.bet
    totalPayout += payout
    return { ...h, done: true, bust: v.total > 21, outcome, payout }
  })

  // Insurance pays 2:1 when the dealer has blackjack.
  const ins = { ...state.insurance }
  if (ins.taken) {
    if (dealerBJ) {
      ins.payout = ins.bet * 3
      ins.result = 'won'
    } else {
      ins.payout = 0
      ins.result = 'lost'
    }
  }

  bankroll += totalPayout + ins.payout
  const profit = totalPayout - totalBet + ins.payout - ins.bet

  let result
  if (hands.length === 1) result = hands[0].outcome
  else result = profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push'

  let message
  if (hands.length === 1) {
    const o = hands[0].outcome
    const money = (n) => `$${Math.abs(n).toLocaleString()}`
    if (dealerBJ && !state.hands.some((h) => h.surrendered)) {
      message = hands[0].outcome === 'push' ? 'Both have blackjack: Push' : 'Dealer has blackjack: Loss'
    } else if (o === 'blackjack') message = `Blackjack! You win ${money(profit)}`
    else if (o === 'win') message = dv.total > 21 ? `Dealer busts. You win ${money(profit)}` : `Win: ${money(profit)}`
    else if (o === 'loss') message = `Loss: -${money(profit)}`
    else if (o === 'bust') message = `Bust: -${money(profit)}`
    else if (o === 'push') message = 'Push: bet returned'
    else message = `Surrender: -${money(profit)}`
  } else {
    message = hands.map((h, i) => `Hand ${i + 1}: ${outcomeLabel(h.outcome)}`).join(' · ')
  }
  if (ins.taken) message += ins.result === 'won' ? ' · Insurance pays 2:1' : ' · Insurance lost'

  return {
    ...state,
    phase: 'settled',
    bankroll,
    hands,
    dealer: { ...state.dealer, hidden: false },
    insurance: ins,
    message,
    summary: { result, bet: totalBet, profit, outcomes: hands.map((h) => h.outcome), dealerBlackjack: dealerBJ },
  }
}

/** Dealer peeks (up card ten/ace) and the player's natural is paid. */
function resolvePeek(state) {
  const up = state.dealer.cards[0].rank
  if (up === 1 || up === 10) {
    if (isBlackjack(state.dealer.cards)) return settle({ ...state, dealer: { ...state.dealer, hidden: false } }, { dealerBlackjack: true })
  }
  if (isBlackjack(state.hands[0].cards)) return settle(state)
  return { ...state, phase: 'player', active: 0 }
}

function advance(state) {
  const next = state.hands.findIndex((h) => !h.done)
  if (next !== -1) return { ...state, active: next }
  const anyLive = state.hands.some((h) => !h.bust && !h.surrendered)
  if (!anyLive) return settle({ ...state, dealer: { ...state.dealer, hidden: false } })
  return { ...state, phase: 'dealer' }
}

const updateActive = (state, fn) => {
  const hands = state.hands.map((h, i) => (i === state.active ? fn(h) : h))
  return { ...state, hands }
}

function withCard(h, card) {
  const cards = [...h.cards, card]
  const v = handValue(cards)
  return { ...h, cards, bust: v.total > 21, done: h.done || v.total >= 21 || h.aces }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return initialGame(action.bankroll ?? state.bankroll)
    case 'SET_BANKROLL':
      return { ...state, bankroll: action.bankroll }
    case 'NEXT':
      return { ...state, phase: 'betting', hands: [], dealer: { cards: [], hidden: true }, message: '', summary: null, feedback: null, active: 0 }
    case 'DEAL': {
      const [p1, up, p2, hole] = action.cards
      const base = {
        ...state,
        roundId: state.roundId + 1,
        bankroll: state.bankroll - action.bet,
        lastBet: action.bet,
        hands: [newHand([p1, p2], action.bet)],
        active: 0,
        dealer: { cards: [up, hole], hidden: true },
        insurance: { offered: false, taken: false, bet: 0, payout: 0, result: null },
        message: '',
        summary: null,
        startTc: action.tc ?? 0,
        decisions: { total: 0, correct: 0, followed: true },
        feedback: null,
      }
      if (up.rank === 1) return { ...base, phase: 'insurance', insurance: { ...base.insurance, offered: true } }
      return resolvePeek({ ...base, phase: 'player' })
    }
    case 'INSURANCE': {
      if (state.phase !== 'insurance') return state
      let next = state
      if (action.take) {
        const bet = state.hands[0].bet / 2
        next = {
          ...state,
          bankroll: state.bankroll - bet,
          insurance: { ...state.insurance, taken: true, bet },
        }
      }
      return resolvePeek({ ...next, phase: 'player' })
    }
    case 'DECISION': {
      const d = state.decisions
      return {
        ...state,
        decisions: {
          total: d.total + 1,
          correct: d.correct + (action.correct ? 1 : 0),
          followed: d.followed && action.correct,
        },
        feedback: action.feedback ?? null,
      }
    }
    case 'CLEAR_FEEDBACK':
      return { ...state, feedback: null }
    case 'HIT': {
      if (state.phase !== 'player') return state
      return advanceIfDone(updateActive(state, (h) => withCard(h, action.card)))
    }
    case 'STAND': {
      if (state.phase !== 'player') return state
      return advance(updateActive(state, (h) => ({ ...h, done: true })))
    }
    case 'DOUBLE': {
      if (state.phase !== 'player') return state
      const h = state.hands[state.active]
      const s = { ...state, bankroll: state.bankroll - h.bet }
      return advance(
        updateActive(s, (hand) => {
          const w = withCard({ ...hand, bet: hand.bet * 2, doubled: true }, action.card)
          return { ...w, done: true }
        }),
      )
    }
    case 'SPLIT': {
      if (state.phase !== 'player') return state
      const h = state.hands[state.active]
      const [c1, c2] = h.cards
      const aces = c1.rank === 1
      const first = withCard(newHand([c1], h.bet, { split: true, aces }), action.card)
      const second = newHand([c2], h.bet, { split: true, aces })
      const s = { ...state, bankroll: state.bankroll - h.bet, hands: [first, second], active: 0 }
      return advance(s)
    }
    case 'DEAL_SECOND': {
      // Second card for the later split hand, dealt once it becomes the active hand.
      if (state.phase !== 'player') return state
      return advanceIfDone(updateActive(state, (h) => withCard(h, action.card)))
    }
    case 'SURRENDER': {
      if (state.phase !== 'player') return state
      const s = updateActive(state, (h) => ({ ...h, surrendered: true, done: true }))
      return settle({ ...s, dealer: { ...s.dealer, hidden: false } })
    }
    case 'REVEAL':
      return { ...state, dealer: { ...state.dealer, hidden: false } }
    case 'DEALER_DRAW':
      return { ...state, dealer: { ...state.dealer, cards: [...state.dealer.cards, action.card] } }
    case 'SETTLE':
      return settle(state)
    default:
      return state
  }
}

function advanceIfDone(state) {
  const h = state.hands[state.active]
  return h.done ? advance(state) : state
}
