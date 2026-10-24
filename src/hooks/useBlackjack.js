import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { handValue, PENETRATION_LIMIT, CARDS_PER_DECK } from '../utils/cards.js'
import { reducer, initialGame, getLegal, MIN_BET, MAX_BET } from '../utils/blackjackReducer.js'

const FAST = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'test'
const sleep = (ms) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)))

/**
 * Blackjack game controller: a pure reducer (state machine) plus the async glue that draws
 * cards from the Deck of Cards API, feeds the card counter and runs the dealer.
 *
 * deps:
 *  deck, counter       hooks from useDeck / useCardCount
 *  run(fn)             serialises async actions and surfaces API errors (with retry)
 *  busy, blocked       true while an action runs / while an API error is showing
 *  setShuffling(bool)  toggles the "Shuffling..." notice
 *  getRecommendation() current recommended action ({ action, why }) or null
 *  onDecision(correct) called once per player decision
 *  onSettled(summary, ctx) called once per finished round
 */
export function useBlackjack(deps) {
  const { busy, blocked, initialBankroll } = deps
  const [state, dispatch] = useReducer(reducer, initialBankroll, initialGame)
  const stateRef = useRef(state)
  stateRef.current = state
  // Always-current dependencies, so the callbacks below keep a stable identity.
  const d = useRef(deps)
  d.current = deps
  const settledRef = useRef(0)

  // Cards physically on the table that are already counted (the hole card is tracked separately).
  const visibleCards = useCallback(() => {
    const s = stateRef.current
    if (s.phase === 'betting' || s.phase === 'settled') return []
    return [...s.hands.flatMap((h) => h.cards), ...s.dealer.cards.slice(0, 1), ...s.dealer.cards.slice(2)]
  }, [])

  const drawCards = useCallback(
    async (n) => {
      const { cards, reshuffled } = await d.current.deck.draw(n)
      if (reshuffled) d.current.counter.reset(visibleCards())
      return cards
    },
    [visibleCards],
  )

  const maybeReshuffle = useCallback(async () => {
    const { deck, counter, setShuffling } = d.current
    const { remaining, deckCount } = deck.ref.current
    if (remaining <= PENETRATION_LIMIT * deckCount * CARDS_PER_DECK) {
      setShuffling(true)
      try {
        await deck.reshuffle()
        counter.reset()
        await sleep(1200)
      } finally {
        setShuffling(false)
      }
    }
  }, [])

  const record = useCallback((action) => {
    const rec = d.current.getRecommendation()
    if (!rec) return
    const correct = rec.action === action
    dispatch({ type: 'DECISION', correct, feedback: { correct, chosen: action, recommended: rec.action, why: rec.why } })
    d.current.onDecision(correct)
  }, [])

  const legal = useMemo(() => getLegal(state), [state])

  const deal = useCallback(
    (bet) =>
      d.current.run(async () => {
        const s = stateRef.current
        if (s.phase !== 'betting' && s.phase !== 'settled') return
        if (bet < MIN_BET || bet > Math.min(MAX_BET, s.bankroll)) return
        const { deck, counter } = d.current
        await maybeReshuffle()
        const tc = counter.trueCount(deck.ref.current.remaining)
        const cards = await drawCards(4) // player, dealer up, player, dealer hole
        counter.add([cards[0], cards[1], cards[2]])
        counter.hold(cards[3])
        dispatch({ type: 'DEAL', bet, cards, tc })
      }),
    [maybeReshuffle, drawCards],
  )

  const drawAnd = useCallback(
    (action, type) =>
      d.current.run(async () => {
        if (!getLegal(stateRef.current)[action]) return
        const [card] = await drawCards(1)
        d.current.counter.add([card])
        record(action)
        dispatch({ type, card })
      }),
    [drawCards, record],
  )

  const hit = useCallback(() => drawAnd('hit', 'HIT'), [drawAnd])
  const double = useCallback(() => drawAnd('double', 'DOUBLE'), [drawAnd])
  const split = useCallback(() => drawAnd('split', 'SPLIT'), [drawAnd])

  const stand = useCallback(() => {
    if (d.current.busy || !getLegal(stateRef.current).stand) return
    record('stand')
    dispatch({ type: 'STAND' })
  }, [record])

  const surrender = useCallback(() => {
    if (d.current.busy || !getLegal(stateRef.current).surrender) return
    record('surrender')
    dispatch({ type: 'SURRENDER' })
  }, [record])

  const insurance = useCallback(
    (take) => {
      if (d.current.busy || stateRef.current.phase !== 'insurance') return
      record(take ? 'insurance' : 'decline')
      dispatch({ type: 'INSURANCE', take })
    },
    [record],
  )

  const nextHand = useCallback(
    () =>
      d.current.run(async () => {
        if (stateRef.current.phase !== 'settled') return
        dispatch({ type: 'NEXT' })
        await maybeReshuffle()
      }),
    [maybeReshuffle],
  )

  const reset = useCallback((bankroll) => dispatch({ type: 'RESET', bankroll }), [])
  const setBankroll = useCallback((bankroll) => dispatch({ type: 'SET_BANKROLL', bankroll }), [])

  // The later split hand gets its second card when it becomes the active hand.
  useEffect(() => {
    if (busy || blocked || state.phase !== 'player') return
    const h = state.hands[state.active]
    if (h && h.cards.length === 1) {
      d.current.run(async () => {
        const [card] = await drawCards(1)
        d.current.counter.add([card])
        dispatch({ type: 'DEAL_SECOND', card })
      })
    }
  }, [busy, blocked, state.phase, state.active, state.hands, drawCards])

  // Dealer plays out (stands on all 17s).
  useEffect(() => {
    if (busy || blocked || state.phase !== 'dealer') return
    d.current.run(async () => {
      if (stateRef.current.dealer.hidden) {
        dispatch({ type: 'REVEAL' })
        await sleep(650)
      }
      let cards = [...stateRef.current.dealer.cards]
      while (handValue(cards).total < 17) {
        const [card] = await drawCards(1)
        d.current.counter.add([card])
        dispatch({ type: 'DEALER_DRAW', card })
        cards = [...cards, card]
        await sleep(600)
      }
      dispatch({ type: 'SETTLE' })
    })
  }, [busy, blocked, state.phase, drawCards])

  // Count the hole card once it is face up.
  useEffect(() => {
    if (state.phase !== 'betting' && !state.dealer.hidden) d.current.counter.revealHole()
  }, [state.phase, state.dealer.hidden, state.roundId])

  // Report each finished round once.
  useEffect(() => {
    if (state.phase === 'settled' && settledRef.current !== state.roundId) {
      settledRef.current = state.roundId
      d.current.onSettled(state.summary, {
        bankroll: state.bankroll,
        decisions: state.decisions,
        startTc: state.startTc,
      })
    }
  }, [state.phase, state.roundId, state.summary, state.bankroll, state.decisions, state.startTc])

  const actions = useMemo(
    () => ({ deal, hit, stand, double, split, surrender, insurance, nextHand, reset, setBankroll }),
    [deal, hit, stand, double, split, surrender, insurance, nextHand, reset, setBankroll],
  )
  return { state, legal, actions }
}
