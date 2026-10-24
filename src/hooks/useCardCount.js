import { useCallback, useRef, useState } from 'react'
import { hiLoValue, trueCount as computeTrueCount, emptySeen, rankOf } from '../utils/cards.js'

const initial = () => ({ running: 0, seen: emptySeen(), hole: null })

function addCards(state, cards) {
  const seen = state.seen.slice()
  let running = state.running
  for (const c of cards) {
    const r = rankOf(c)
    seen[r] += 1
    running += hiLoValue(r)
  }
  return { ...state, running, seen }
}

/**
 * Hi-Lo running count plus the multiset of cards seen (used for shoe composition).
 * The dealer's hole card is held aside and only counted once it is revealed.
 * State lives in a ref as well, so async game code can read the latest value synchronously.
 */
export function useCardCount() {
  const ref = useRef(initial())
  const [state, setState] = useState(ref.current)

  const apply = useCallback((fn) => {
    ref.current = fn(ref.current)
    setState(ref.current)
  }, [])

  const add = useCallback((cards) => apply((s) => addCards(s, cards)), [apply])
  const hold = useCallback((card) => apply((s) => ({ ...s, hole: rankOf(card) })), [apply])
  const revealHole = useCallback(
    () => apply((s) => (s.hole == null ? s : { ...addCards(s, [s.hole]), hole: null })),
    [apply],
  )
  /** New shuffle. `visible` are cards physically on the table that stay counted. */
  const reset = useCallback(
    (visible = []) => apply((s) => addCards({ running: 0, seen: emptySeen(), hole: s.hole }, visible)),
    [apply],
  )
  /** Restore a saved shoe; a saved pending hole card is folded in (that round was abandoned). */
  const restore = useCallback(
    (saved) =>
      apply(() => {
        let s = {
          running: Number(saved?.running) || 0,
          seen: Array.isArray(saved?.seen) && saved.seen.length === 11 ? saved.seen.map((n) => Number(n) || 0) : emptySeen(),
          hole: null,
        }
        if (saved?.hole) s = addCards(s, [saved.hole])
        return s
      }),
    [apply],
  )

  const trueCount = useCallback((remaining) => computeTrueCount(ref.current.running, remaining), [])

  return {
    running: state.running,
    seen: state.seen,
    hole: state.hole,
    ref,
    add,
    hold,
    revealHole,
    reset,
    restore,
    trueCount,
    trueCountFor: (remaining) => computeTrueCount(state.running, remaining),
  }
}
