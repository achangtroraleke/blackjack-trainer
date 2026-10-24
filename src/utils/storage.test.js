import { describe, it, expect } from 'vitest'
import { defaultData, applyRound, STORAGE_KEY } from './storage.js'
import { mergeDefaults, readStorage, writeStorage } from '../hooks/useLocalStorage.js'

const summary = (result, profit, bet = 100) => ({ result, profit, bet, outcomes: [result] })
const ctx = (bankroll, followed = true, total = 1, startTc = 0) => ({
  bankroll,
  startTc,
  decisions: { total, correct: total, followed },
})

describe('applyRound', () => {
  it('counts each result type and tracks net profit', () => {
    let d = defaultData()
    d = applyRound(d, summary('win', 100), ctx(1100))
    d = applyRound(d, summary('loss', -100), ctx(1000))
    d = applyRound(d, summary('bust', -100), ctx(900))
    d = applyRound(d, summary('push', 0), ctx(900))
    d = applyRound(d, summary('blackjack', 150), ctx(1050))
    d = applyRound(d, summary('surrender', -50), ctx(1000))
    expect(d.stats).toMatchObject({ hands: 6, wins: 1, losses: 2, pushes: 1, blackjacks: 1, surrenders: 1, net: 0 })
    expect(d.bankroll).toBe(1000)
    expect(d.history.map((h) => h.result)).toEqual(['Win', 'Loss', 'Bust', 'Push', 'Blackjack', 'Surrender'])
  })

  it('records true count and whether the book play was followed', () => {
    const d = applyRound(defaultData(), summary('win', 100), ctx(1100, false, 2, 3.5))
    expect(d.history[0]).toMatchObject({ tc: 3.5, followed: false, bet: 100, profit: 100, bankroll: 1100 })
    const none = applyRound(defaultData(), summary('win', 100), ctx(1100, true, 0))
    expect(none.history[0].followed).toBeNull()
  })

  it('keeps only the last 50 hands', () => {
    let d = defaultData()
    for (let i = 0; i < 60; i++) d = applyRound(d, summary('win', 10), ctx(1000 + i * 10))
    expect(d.history).toHaveLength(50)
    expect(d.history[0].id).toBe(11)
    expect(d.stats.hands).toBe(60)
  })
})

describe('localStorage helpers', () => {
  it('uses the single versioned key', () => {
    expect(STORAGE_KEY).toBe('bjTrainer_v1')
  })

  it('round-trips data', () => {
    const d = { ...defaultData(), bankroll: 1234, deckCount: 8 }
    expect(writeStorage(STORAGE_KEY, d)).toBe(true)
    expect(readStorage(STORAGE_KEY, defaultData())).toMatchObject({ bankroll: 1234, deckCount: 8 })
  })

  it('fills in new fields from defaults and survives corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bankroll: 500, settings: { practice: true } }))
    const d = readStorage(STORAGE_KEY, defaultData())
    expect(d.bankroll).toBe(500)
    expect(d.settings).toMatchObject({ practice: true, showTips: true })
    expect(d.stats.hands).toBe(0)

    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(readStorage(STORAGE_KEY, defaultData()).bankroll).toBe(1000)
  })

  it('does not throw when storage is unavailable', () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    try {
      expect(writeStorage(STORAGE_KEY, { a: 1 })).toBe(false)
    } finally {
      Storage.prototype.setItem = orig
    }
  })

  it('mergeDefaults replaces arrays instead of merging them', () => {
    expect(mergeDefaults({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [9], b: { c: 5 } })).toEqual({ a: [9], b: { c: 5, d: 2 } })
  })
})
