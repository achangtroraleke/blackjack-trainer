// Shoe-based dealer outcome distribution and exact-ish EV for each player action.
//
// The unknown card pool is: full shoe minus every card the player has seen (the dealer's
// hole card is NOT subtracted, because the player has not seen it). The dealer is assumed
// to have peeked and does not have blackjack, so the hole card is drawn from that pool
// excluding the card that would complete a natural.
//
// EV is per unit of the original bet. Double returns 2x the per-unit swing, and split
// returns the sum of both hands (each hand evaluated independently).

import { fullComposition, rankOf } from './cards.js'

/** Remaining composition (index 1..10) = full shoe minus cards seen. */
export function buildComposition(deckCount, seen) {
  const comp = fullComposition(deckCount)
  for (let r = 1; r <= 10; r++) comp[r] = Math.max(0, comp[r] - ((seen && seen[r]) || 0))
  return comp
}

const sumComp = (c) => {
  let t = 0
  for (let r = 1; r <= 10; r++) t += c[r]
  return t
}

/**
 * Dealer final-total distribution (dealer stands on all 17s) given unknown pool `comp`
 * and upcard rank `up` (1 = Ace). Dealer blackjack is excluded (peek).
 * Returns { p: [P17, P18, P19, P20, P21], bust }.
 */
export function dealerDistribution(comp, up) {
  const c = comp.slice()
  let total = sumComp(c)
  const res = [0, 0, 0, 0, 0, 0]

  function rec(hard, ace, prob, first) {
    let avail = total
    if (first) {
      if (up === 1) avail -= c[10]
      else if (up === 10) avail -= c[1]
    }
    if (avail <= 0) return
    for (let r = 1; r <= 10; r++) {
      const n = c[r]
      if (!n) continue
      if (first && ((up === 1 && r === 10) || (up === 10 && r === 1))) continue
      const p = (prob * n) / avail
      const h = hard + r
      const a = ace || r === 1
      if (h > 21) {
        res[5] += p
        continue
      }
      const v = a && h + 10 <= 21 ? h + 10 : h
      if (v >= 17) {
        res[v - 17] += p
        continue
      }
      c[r]--
      total--
      rec(h, a, p, false)
      c[r]++
      total++
    }
  }

  rec(up, up === 1, 1, true)
  const s = res.reduce((a, b) => a + b, 0)
  if (s > 0 && Math.abs(s - 1) > 1e-12) for (let i = 0; i < 6; i++) res[i] /= s
  return { p: res.slice(0, 5), bust: res[5] }
}

/** Player standing on `v` against dealer distribution `d`. */
export function standOutcome(v, d) {
  let w = d.bust
  let push = 0
  let l = 0
  for (let i = 0; i < 5; i++) {
    const dv = 17 + i
    const pr = d.p[i]
    if (v > dv) w += pr
    else if (v === dv) push += pr
    else l += pr
  }
  return { w, p: push, l, ev: w - l }
}

const BUST = Object.freeze({ w: 0, p: 0, l: 1, ev: -1 })
const valueOf = (hard, ace) => (ace && hard + 10 <= 21 ? hard + 10 : hard)

function makeEvaluator(initCards, up, comp) {
  const cur = comp.slice()
  let curTotal = sumComp(cur)
  const drawn = new Array(11).fill(0)
  const initHard = initCards.reduce((s, r) => s + r, 0)
  const initAce = initCards.includes(1)
  const distMemo = new Map()
  const contMemo = new Map()
  let baseDist = null

  const keyOf = () => drawn.join(',')

  // Exact dealer distribution for the first two cards the player draws; deeper in the
  // tree the effect of removed cards on the dealer is negligible, so reuse the base one.
  function dealerFor(nDrawn) {
    if (nDrawn >= 3) {
      if (!baseDist) baseDist = dealerDistribution(comp, up)
      return baseDist
    }
    const k = keyOf()
    let d = distMemo.get(k)
    if (!d) {
      d = dealerDistribution(cur, up)
      distMemo.set(k, d)
    }
    return d
  }

  const standAt = (hard, ace, nDrawn) => standOutcome(valueOf(hard, ace), dealerFor(nDrawn))

  function withDraw(r, fn) {
    cur[r]--
    curTotal--
    drawn[r]++
    const out = fn()
    cur[r]++
    curTotal++
    drawn[r]--
    return out
  }

  function hitAt(hard, ace, nDrawn) {
    if (curTotal <= 0) return standAt(hard, ace, nDrawn)
    const a = { w: 0, p: 0, l: 0, ev: 0 }
    for (let r = 1; r <= 10; r++) {
      const n = cur[r]
      if (!n) continue
      const pr = n / curTotal
      const o = withDraw(r, () => contAt(hard + r, ace || r === 1, nDrawn + 1))
      a.w += pr * o.w
      a.p += pr * o.p
      a.l += pr * o.l
      a.ev += pr * o.ev
    }
    return a
  }

  // Best of stand / hit from this state (no doubling after the first decision).
  function contAt(hard, ace, nDrawn) {
    if (hard > 21) return BUST
    const k = keyOf()
    const memo = contMemo.get(k)
    if (memo) return memo
    const s = standAt(hard, ace, nDrawn)
    let best = s
    if (valueOf(hard, ace) < 21) {
      const h = hitAt(hard, ace, nDrawn)
      if (h.ev > s.ev) best = h
    }
    contMemo.set(k, best)
    return best
  }

  function doubleAt(hard, ace, nDrawn) {
    if (curTotal <= 0) {
      const s = standAt(hard, ace, nDrawn)
      return { ...s, ev: 2 * s.ev }
    }
    const a = { w: 0, p: 0, l: 0, ev: 0 }
    for (let r = 1; r <= 10; r++) {
      const n = cur[r]
      if (!n) continue
      const pr = n / curTotal
      const o = withDraw(r, () => (hard + r > 21 ? BUST : standAt(hard + r, ace || r === 1, nDrawn + 1)))
      a.w += pr * o.w
      a.p += pr * o.p
      a.l += pr * o.l
      a.ev += pr * o.ev
    }
    a.ev *= 2
    return a
  }

  // One split hand that starts from a single card: draw a second card, then play optimally
  // (double after split allowed, no re-split, split aces get exactly one card).
  function splitHand(isAces) {
    const a = { w: 0, p: 0, l: 0, ev: 0 }
    for (let c = 1; c <= 10; c++) {
      const n = cur[c]
      if (!n) continue
      const pr = n / curTotal
      const o = withDraw(c, () => {
        const hard = initHard + c
        const ace = initAce || c === 1
        const s = standAt(hard, ace, 1)
        if (isAces) return s
        let best = s
        if (valueOf(hard, ace) < 21) {
          const h = hitAt(hard, ace, 1)
          if (h.ev > best.ev) best = h
        }
        const d = doubleAt(hard, ace, 1)
        if (d.ev > best.ev) best = d
        return best
      })
      a.w += pr * o.w
      a.p += pr * o.p
      a.l += pr * o.l
      a.ev += pr * o.ev
    }
    return a
  }

  return {
    stand: () => standAt(initHard, initAce, 0),
    hit: () => hitAt(initHard, initAce, 0),
    double: () => doubleAt(initHard, initAce, 0),
    splitHand,
  }
}

const round = (x) => Math.round(x * 1e6) / 1e6

/**
 * Analyze the current hand.
 * input: { cards (cards or ranks), up (rank 1..10), comp, canDouble, canSplit, canSurrender }
 * Returns { actions: { stand, hit, double?, split?, surrender? }, best, dealer: { p, bust }, unknown }
 * Each action: { w, p, l, ev } (probabilities per hand; ev per unit of original bet).
 */
export function analyzeHand({ cards, up, comp, canDouble = false, canSplit = false, canSurrender = false }) {
  const ranks = cards.map(rankOf)
  const ev = makeEvaluator(ranks, up, comp)
  const actions = { stand: ev.stand(), hit: ev.hit() }
  if (canDouble) actions.double = ev.double()
  if (canSplit && ranks.length === 2 && ranks[0] === ranks[1]) {
    const r = ranks[0]
    const s = makeEvaluator([r], up, comp).splitHand(r === 1)
    actions.split = { w: s.w, p: s.p, l: s.l, ev: 2 * s.ev }
  }
  if (canSurrender) actions.surrender = { w: 0, p: 0, l: 1, ev: -0.5 }

  let best = 'stand'
  for (const [name, o] of Object.entries(actions)) if (o.ev > actions[best].ev + 1e-12) best = name

  const clean = {}
  for (const [k, o] of Object.entries(actions)) {
    clean[k] = { w: round(o.w), p: round(o.p), l: round(o.l), ev: round(o.ev) }
  }
  const dealer = dealerDistribution(comp, up)
  return { actions: clean, best, dealer, unknown: sumComp(comp) }
}

/** Insurance: probability the hole card is a ten and EV per unit of insurance bet (pays 2:1). */
export function insuranceInfo(comp) {
  const total = sumComp(comp)
  const p10 = total > 0 ? comp[10] / total : 4 / 13
  return { p10, ev: 3 * p10 - 1 }
}
