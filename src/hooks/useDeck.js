import { useCallback, useRef, useState } from 'react'
import { normalizeCard, CARDS_PER_DECK, BACK_IMAGE } from '../utils/cards.js'

const API = 'https://deckofcardsapi.com/api/deck'

export class DeckApiError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'DeckApiError'
    this.code = code
  }
}

async function getJSON(url) {
  let res
  try {
    res = await fetch(url)
  } catch {
    throw new DeckApiError('Could not reach the Deck of Cards API. Check your connection and retry.', 'network')
  }
  if (!res.ok) throw new DeckApiError(`Deck of Cards API returned an error (HTTP ${res.status}).`, 'http')
  let data
  try {
    data = await res.json()
  } catch {
    throw new DeckApiError('The Deck of Cards API returned an unreadable response.', 'parse')
  }
  return data
}

const preloaded = new Set()
export function preloadImage(src) {
  if (!src || preloaded.has(src) || typeof Image === 'undefined') return
  preloaded.add(src)
  const img = new Image()
  img.src = src
}

const isGone = (msg = '') => /does not exist|invalid|not found/i.test(msg)
const isShort = (msg = '') => /not enough/i.test(msg)

/**
 * Shoe state + Deck of Cards API calls.
 * `remaining` comes from the API response of every call.
 */
export function useDeck() {
  const [shoe, setShoe] = useState({ deckId: null, remaining: 0, deckCount: 6 })
  const [loading, setLoading] = useState(false)
  const ref = useRef(shoe)

  const commit = useCallback((next) => {
    ref.current = next
    setShoe(next)
  }, [])

  const track = useCallback(async (fn) => {
    setLoading(true)
    try {
      return await fn()
    } finally {
      setLoading(false)
    }
  }, [])

  const newShoe = useCallback(
    (deckCount) =>
      track(async () => {
        preloadImage(BACK_IMAGE)
        const data = await getJSON(`${API}/new/shuffle/?deck_count=${deckCount}`)
        if (!data.success) throw new DeckApiError('The Deck of Cards API could not create a shoe.', 'create')
        const next = { deckId: data.deck_id, remaining: data.remaining, deckCount }
        commit(next)
        return next
      }),
    [commit, track],
  )

  const reshuffle = useCallback(
    () =>
      track(async () => {
        const { deckId, deckCount } = ref.current
        if (!deckId) return newShoe(deckCount)
        const data = await getJSON(`${API}/${deckId}/shuffle/`)
        if (!data.success) return newShoe(deckCount)
        const next = { deckId: data.deck_id, remaining: data.remaining, deckCount }
        commit(next)
        return next
      }),
    [commit, newShoe, track],
  )

  /**
   * Resume a saved shoe. Uses "shuffle remaining only" as a validity probe: it keeps the
   * drawn cards out of the shoe, so the saved seen-card composition stays valid.
   * Resolves false if the deck is gone/expired (caller creates a new one).
   */
  const restore = useCallback(
    (saved) =>
      track(async () => {
        if (!saved?.deckId) return false
        const data = await getJSON(`${API}/${saved.deckId}/shuffle/?remaining=true`)
        if (!data.success || isGone(data.error)) return false
        commit({ deckId: data.deck_id, remaining: data.remaining, deckCount: saved.deckCount })
        preloadImage(BACK_IMAGE)
        return true
      }),
    [commit, track],
  )

  /**
   * Draw n cards. Resolves { cards, reshuffled }. If the shoe runs out (or expired) mid-round
   * it is reshuffled and `reshuffled` is true so the caller can reset the count.
   */
  const draw = useCallback(
    async (n) => {
      let reshuffled = false
      if (!ref.current.deckId) throw new DeckApiError('No shoe is available yet.', 'noshoe')
      if (ref.current.remaining < n) {
        await reshuffle()
        reshuffled = true
      }
      let data = await getJSON(`${API}/${ref.current.deckId}/draw/?count=${n}`)
      if (!data.success) {
        if (isShort(data.error) || isGone(data.error)) {
          if (isGone(data.error)) await newShoe(ref.current.deckCount)
          else await reshuffle()
          reshuffled = true
          data = await getJSON(`${API}/${ref.current.deckId}/draw/?count=${n}`)
        }
        if (!data.success) throw new DeckApiError(data.error || 'The Deck of Cards API could not draw cards.', 'draw')
      }
      commit({ ...ref.current, remaining: data.remaining })
      const cards = data.cards.map(normalizeCard)
      cards.forEach((c) => preloadImage(c.image))
      return { cards, reshuffled }
    },
    [commit, newShoe, reshuffle],
  )

  const total = shoe.deckCount * CARDS_PER_DECK
  return { ...shoe, total, loading, ref, newShoe, reshuffle, restore, draw }
}
