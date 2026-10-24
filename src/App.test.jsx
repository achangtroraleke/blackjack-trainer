import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App.jsx'

// ---- a tiny in-memory Deck of Cards API ----
const SUITS = { S: 'SPADES', H: 'HEARTS', D: 'DIAMONDS', C: 'CLUBS' }
const NAMES = { A: 'ACE', K: 'KING', Q: 'QUEEN', J: 'JACK', 0: '10' }
function apiCard(code) {
  const v = code[0]
  return {
    code,
    image: `https://deckofcardsapi.com/static/img/${code}.png`,
    images: {},
    value: NAMES[v] || v,
    suit: SUITS[code[1]],
  }
}

function installFakeApi(script) {
  let deckCount = 6
  let remaining = 312
  let idx = 0
  const calls = []
  const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
  const impl = vi.fn((input) => {
    const url = new URL(String(input))
    calls.push(url.pathname + url.search)
    if (url.pathname.endsWith('/new/shuffle/')) {
      deckCount = Number(url.searchParams.get('deck_count'))
      remaining = deckCount * 52
      idx = 0
      return json({ success: true, deck_id: 'fakedeck', remaining, shuffled: true })
    }
    if (url.pathname.endsWith('/draw/')) {
      const n = Number(url.searchParams.get('count'))
      const cards = []
      for (let i = 0; i < n; i++) cards.push(apiCard(script[idx++ % script.length]))
      remaining -= n
      return json({ success: true, deck_id: 'fakedeck', cards, remaining })
    }
    if (url.pathname.endsWith('/shuffle/')) {
      if (url.searchParams.get('remaining') !== 'true') remaining = deckCount * 52
      return json({ success: true, deck_id: 'fakedeck', remaining, shuffled: true })
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
  })
  vi.stubGlobal('fetch', impl)
  return { calls, impl }
}

let errorSpy
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  errorSpy.mockRestore()
})

const realErrors = () =>
  errorSpy.mock.calls.filter((c) => !String(c[0]).includes('not wrapped in act') && !String(c[0]).includes('act(...)'))

describe('Blackjack Trainer app', () => {
  it('plays a full hand against the (mock) API and persists across a reload', async () => {
    // p1 9H, up 6D, p2 7C, hole 0S (10)  -> hard 16 vs 6; dealer draws 0H (10) and busts
    const api = installFakeApi(['9H', '6D', '7C', '0S', '0H', '2C', '3C'])
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    // setup modal -> pick 2 decks
    await screen.findByRole('dialog', { name: /welcome/i })
    await user.click(screen.getByRole('radio', { name: '2 decks' }))
    await user.click(screen.getByRole('button', { name: /start playing/i }))
    await waitFor(() => expect(api.calls.some((c) => c.includes('deck_count=2'))).toBe(true))

    // bet $25 and deal
    const chip = await screen.findByRole('button', { name: /add 25 dollars/i })
    await waitFor(() => expect(chip).toBeEnabled())
    await user.click(screen.getByRole('button', { name: /clear bet/i })) // default bet is $25
    await user.click(chip)
    await user.click(screen.getByRole('button', { name: /deal with a bet of 25 dollars/i }))

    // cards are drawn in one call of 4, hole card stays face down
    await screen.findByAltText('9 of hearts')
    expect(screen.getByAltText('Face-down card')).toBeInTheDocument()
    expect(api.calls.some((c) => c.includes('/draw/?count=4'))).toBe(true)

    // advisor: hard 16 vs 6 -> stand, with odds table and a tip
    const rec = await screen.findByTestId('recommended-action')
    expect(rec).toHaveTextContent('Stand')
    await screen.findByText(/Dealer busts/i)
    const table = screen.getByRole('table', { name: /win, push and loss/i })
    expect(within(table).getByRole('row', { name: /hit/i })).toBeInTheDocument()
    expect(screen.getByText(/busts .* of the time/i)).toBeInTheDocument()

    // count so far: 9 (0), 6 (+1), 7 (0); hole card not counted yet
    expect(screen.getByTestId('header-running')).toHaveTextContent('+1')

    // stand -> dealer reveals 10 (hole), draws 10 and busts
    await user.click(screen.getByRole('button', { name: /^stand/i }))
    await screen.findByText(/dealer busts\. you win \$25/i)
    expect(screen.getByTestId('bankroll')).toHaveTextContent('$1,025')
    // 9(0) 6(+1) 7(0) 10(-1) 10(-1) = -1
    expect(screen.getByTestId('header-running')).toHaveTextContent('-1')

    // stats persisted under the single versioned key
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('bjTrainer_v1'))
      expect(saved.stats).toMatchObject({ hands: 1, wins: 1, net: 25 })
      expect(saved.bankroll).toBe(1025)
      expect(saved.deckCount).toBe(2)
      expect(saved.shoe).toMatchObject({ deckId: 'fakedeck', running: -1, deckCount: 2 })
      expect(saved.history).toHaveLength(1)
    })

    // reload: the saved shoe is validated and resumed (no new shoe is created)
    unmount()
    api.calls.length = 0
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('bankroll')).toHaveTextContent('$1,025'))
    await waitFor(() => expect(screen.getByTestId('header-running')).toHaveTextContent('-1'))
    expect(api.calls.some((c) => c.includes('remaining=true'))).toBe(true)
    expect(api.calls.some((c) => c.includes('/new/shuffle/'))).toBe(false)

    expect(realErrors()).toEqual([])
  })

  it('shows an error with a retry button when the API fails', async () => {
    let fail = true
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        if (fail) return Promise.reject(new Error('offline'))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, deck_id: 'd', remaining: 312, shuffled: true }),
        })
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /start playing/i }))
    const alert = await screen.findByRole('alertdialog')
    expect(alert).toHaveTextContent(/could not reach/i)

    fail = false
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /deal with a bet/i })).toBeInTheDocument()
  })
})
