import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Table from './components/Table.jsx'
import Controls from './components/Controls.jsx'
import CountDisplay from './components/CountDisplay.jsx'
import AdvisorPanel from './components/AdvisorPanel.jsx'
import StatsPanel from './components/StatsPanel.jsx'
import StrategyChart from './components/StrategyChart.jsx'
import SetupModal from './components/SetupModal.jsx'
import { useLocalStorage } from './hooks/useLocalStorage.js'
import { useDeck } from './hooks/useDeck.js'
import { useCardCount } from './hooks/useCardCount.js'
import { useBlackjack } from './hooks/useBlackjack.js'
import { useAdvisor } from './hooks/useAdvisor.js'
import { STORAGE_KEY, START_BANKROLL, defaultData, applyRound } from './utils/storage.js'
import { recommend, describeHand, shouldTakeInsurance } from './utils/strategy.js'
import { buildComposition, insuranceInfo } from './utils/probability.js'
import { buildTip, insuranceTip, upName, ACTION_LABEL } from './utils/tips.js'
import { formatSigned, suggestedUnits, BET_UNIT, CARDS_PER_DECK } from './utils/cards.js'
import { MIN_BET } from './utils/blackjackReducer.js'

const DEFAULTS = defaultData()

export default function App() {
  const [data, update] = useLocalStorage(STORAGE_KEY, DEFAULTS)
  const { settings } = data
  const deck = useDeck()
  const counter = useCardCount()

  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [apiError, setApiError] = useState(null)
  const [shuffling, setShuffling] = useState(false)
  const [ready, setReady] = useState(false)
  const [showSetup, setShowSetup] = useState(!data.setupDone)
  const [showStats, setShowStats] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [lastGuess, setLastGuess] = useState(null)

  const setSettings = useCallback(
    (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    [update],
  )

  // Serialise async actions; on failure show the error with a retry that re-runs the action.
  const run = useCallback(async (fn) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setApiError(null)
    try {
      await fn()
    } catch (e) {
      setApiError({ message: (e && e.message) || 'Something went wrong.', retry: () => run(fn) })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const recRef = useRef(null)
  const getRecommendation = useCallback(() => recRef.current, [])

  const onDecision = useCallback(
    (correct) =>
      update((d) => ({
        ...d,
        strategy: { correct: d.strategy.correct + (correct ? 1 : 0), total: d.strategy.total + 1 },
      })),
    [update],
  )

  const onSettled = useCallback((summary, ctx) => update((d) => applyRound(d, summary, ctx)), [update])

  const game = useBlackjack({
    deck,
    counter,
    run,
    busy,
    blocked: !!apiError,
    setShuffling,
    initialBankroll: data.bankroll,
    getRecommendation,
    onDecision,
    onSettled,
  })
  const g = game.state
  const { legal, actions } = game

  // ---- start-up: resume the saved shoe, or create a new one ----
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    if (!data.setupDone) return
    run(async () => {
      const saved = data.shoe
      let ok = false
      if (saved && saved.deckId && saved.deckCount === data.deckCount) ok = await deck.restore(saved)
      if (ok) {
        counter.restore(saved)
      } else {
        await deck.newShoe(data.deckCount)
        counter.reset()
      }
      setReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the current shoe (id, remaining, running count and seen cards) so a refresh resumes.
  useEffect(() => {
    if (!ready || !deck.deckId) return
    update((d) => ({
      ...d,
      shoe: {
        deckId: deck.deckId,
        remaining: deck.remaining,
        deckCount: deck.deckCount,
        running: counter.running,
        seen: counter.seen,
        hole: counter.hole,
      },
    }))
  }, [ready, deck.deckId, deck.remaining, deck.deckCount, counter.running, counter.seen, counter.hole, update])

  // Fresh round: forget the previous count check.
  useEffect(() => {
    setRevealed(false)
    setLastGuess(null)
  }, [g.roundId])

  const startShoe = useCallback(
    (n) => {
      setShowSetup(false)
      run(async () => {
        await deck.newShoe(n)
        counter.reset()
        update((d) => ({ ...d, deckCount: n, setupDone: true, shoe: null }))
        actions.reset()
        setRevealed(false)
        setLastGuess(null)
        setReady(true)
      })
    },
    [run, deck, counter, update, actions],
  )

  // ---- derived values ----
  const inRound = g.phase === 'insurance' || g.phase === 'player' || g.phase === 'dealer'
  const tc = counter.trueCountFor(deck.remaining)
  const decksLeft = deck.remaining / CARDS_PER_DECK
  const countShown = settings.practice ? revealed : settings.showCount
  const comp = useMemo(() => buildComposition(data.deckCount, counter.seen), [data.deckCount, counter.seen])

  const activeHand = g.phase === 'player' ? g.hands[g.active] : null
  const upCard = g.dealer.cards[0]
  const up = upCard ? upCard.rank : null
  const handReady = !!(activeHand && activeHand.cards.length >= 2 && up)

  const rec = useMemo(
    () =>
      handReady
        ? recommend({
            cards: activeHand.cards,
            up,
            decks: data.deckCount,
            canSplit: legal.split,
            canDouble: legal.double,
            canSurrender: legal.surrender,
            tc,
          })
        : null,
    [handReady, activeHand, up, data.deckCount, legal, tc],
  )

  const payload = useMemo(
    () =>
      rec
        ? {
            cards: activeHand.cards.map((c) => c.rank),
            up,
            comp,
            canDouble: legal.double,
            canSplit: legal.split,
            canSurrender: legal.surrender,
          }
        : null,
    [rec, activeHand, up, comp, legal],
  )
  const advisor = useAdvisor(payload)

  const tip = useMemo(
    () =>
      rec ? buildTip({ rec, cards: activeHand.cards, up, analysis: advisor.result, tc, maskCount: !countShown }) : '',
    [rec, activeHand, up, advisor.result, tc, countShown],
  )

  const insurance = useMemo(() => {
    if (g.phase !== 'insurance') return null
    const info = insuranceInfo(comp)
    const take = shouldTakeInsurance(tc)
    return { take, p10: info.p10, tip: insuranceTip({ tc, maskCount: !countShown, p10: info.p10, take }) }
  }, [g.phase, comp, tc, countShown])

  // The trainer scores decisions against this.
  recRef.current = insurance
    ? { action: insurance.take ? 'insurance' : 'decline', why: insurance.tip }
    : rec
      ? { action: rec.action, why: tip }
      : null

  const units = suggestedUnits(tc)
  const suggestedBet = countShown ? Math.min(units * BET_UNIT, Math.max(0, g.bankroll)) : null
  const betTip = countShown
    ? `Bet tip: true count ${formatSigned(tc)} → bet ${units} ${units === 1 ? 'unit' : 'units'} ($${units * BET_UNIT}). Spread: 1 unit at TC ≤ +1, 2 at +2, 4 at +3, 6 at +4, 8 at +5 or more.`
    : 'Bet tip hidden while the count is hidden. Reveal the count to see the suggested bet size.'

  const highlight = rec ? { section: rec.section, row: rec.row, col: rec.col } : null

  const onGuess = (guess) => {
    const actual = counter.running
    const correct = guess === actual
    setLastGuess({ guess, actual, correct })
    setRevealed(true)
    update((d) => ({
      ...d,
      countAcc: { correct: d.countAcc.correct + (correct ? 1 : 0), total: d.countAcc.total + 1 },
    }))
  }

  const canChangeDecks = !inRound
  const canReset = !inRound

  const onResetStats = () => {
    update((d) => ({
      ...d,
      stats: DEFAULTS.stats,
      strategy: DEFAULTS.strategy,
      countAcc: DEFAULTS.countAcc,
      history: [],
      bankroll: START_BANKROLL,
    }))
    actions.reset(START_BANKROLL)
  }

  const onRebuy = () => {
    actions.setBankroll(START_BANKROLL)
    update((d) => ({ ...d, bankroll: START_BANKROLL }))
  }

  // ---- keyboard shortcuts: H S D P R, N for next hand ----
  const keyState = useRef({})
  keyState.current = { legal, actions, phase: g.phase, busy, blocked: showSetup || showStats || !!apiError }
  useEffect(() => {
    const onKey = (e) => {
      const k = keyState.current
      if (e.ctrlKey || e.metaKey || e.altKey || k.blocked || k.busy) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const key = e.key.toLowerCase()
      const map = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' }
      if (map[key] && k.phase === 'player' && k.legal[map[key]]) {
        e.preventDefault()
        k.actions[map[key]]()
      } else if (key === 'n' && k.phase === 'settled') {
        e.preventDefault()
        k.actions.nextHand()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const feedback = settings.trainer && g.feedback
  const penetration = deck.total ? 1 - deck.remaining / deck.total : 0

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span className="header__logo" aria-hidden="true">♠</span>
          <h1>Blackjack Trainer</h1>
        </div>

        <dl className="header__stats">
          <div>
            <dt>Decks</dt>
            <dd>{data.deckCount}</dd>
          </div>
          <div>
            <dt>Cards left</dt>
            <dd>
              {deck.remaining}
              <span className="pen" aria-hidden="true">
                <span style={{ width: `${Math.min(100, penetration * 100)}%` }} />
                <i />
              </span>
            </dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd data-testid="header-running">{countShown ? formatSigned(counter.running) : '•••'}</dd>
          </div>
          <div>
            <dt>
              True{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => setSettings({ showCount: !settings.showCount })}
                disabled={settings.practice}
                aria-pressed={settings.showCount}
                aria-label={settings.showCount ? 'Hide the count' : 'Show the count'}
              >
                {countShown ? 'hide' : 'show'}
              </button>
            </dt>
            <dd data-testid="header-true">{countShown ? formatSigned(tc) : '•••'}</dd>
          </div>
          <div className="header__bank">
            <dt>Bankroll</dt>
            <dd data-testid="bankroll">${g.bankroll.toLocaleString()}</dd>
          </div>
        </dl>

        <nav className="header__nav" aria-label="Tools">
          <button type="button" className="btn btn--small" onClick={() => setShowSetup(true)} aria-label="Open setup and settings">
            Setup
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => setSettings({ showChart: !settings.showChart })}
            aria-pressed={settings.showChart}
            aria-label="Toggle basic strategy chart"
          >
            Chart
          </button>
          <button type="button" className="btn btn--small" onClick={() => setShowStats(true)} aria-label="Open statistics">
            Stats
          </button>
        </nav>
      </header>

      <main className="layout">
        <div className="layout__table">
          <Table game={g} shuffling={shuffling} busy={busy} />

          {feedback && (
            <div className={`feedback ${feedback.correct ? 'feedback--ok' : 'feedback--bad'}`} role="status">
              {feedback.correct ? (
                <strong>✅ Correct: {labelOf(feedback.chosen)}</strong>
              ) : (
                <strong>
                  ❌ Mistake: you chose {labelOf(feedback.chosen)}; the correct play is {labelOf(feedback.recommended)}.
                </strong>
              )}
              {!feedback.correct && feedback.why && <span>{feedback.why}</span>}
            </div>
          )}

          <Controls
            game={g}
            legal={legal}
            busy={busy || shuffling || !ready}
            actions={actions}
            suggestedBet={g.phase === 'betting' ? suggestedBet : null}
            bankrollLow={g.bankroll < MIN_BET}
            onRebuy={onRebuy}
          />
        </div>

        <aside className="layout__side">
          <CountDisplay
            running={counter.running}
            trueCount={tc}
            decksLeft={decksLeft}
            cardsLeft={deck.remaining}
            shown={countShown}
            practice={settings.practice}
            countAcc={data.countAcc}
            lastGuess={lastGuess}
            onGuess={onGuess}
            onReveal={() => setRevealed(true)}
          />
          <AdvisorPanel
            open={settings.advisorOpen}
            onToggle={() => setSettings({ advisorOpen: !settings.advisorOpen })}
            phase={g.phase}
            rec={rec}
            handDesc={rec ? describeHand(activeHand.cards, legal.split) : ''}
            upLabel={up ? upName(up) : ''}
            advisor={advisor}
            tip={tip}
            showTips={settings.showTips}
            insurance={insurance}
            betTip={betTip}
            feedback={null}
            trainerOn={false}
          />
          {settings.showChart && (
            <StrategyChart decks={data.deckCount} highlight={highlight} onClose={() => setSettings({ showChart: false })} />
          )}
        </aside>
      </main>

      <footer className="footer">
        <p>
          Educational use only. This is a practice tool with virtual chips, not gambling advice. Card counting is legal
          but casinos may ask counters to leave. Cards via{' '}
          <a href="https://deckofcardsapi.com/" target="_blank" rel="noreferrer">
            deckofcardsapi.com
          </a>
          .
        </p>
      </footer>

      {showSetup && (
        <SetupModal
          firstRun={!data.setupDone}
          deckCount={data.deckCount}
          canChangeDecks={canChangeDecks}
          settings={settings}
          onSettings={setSettings}
          onStart={startShoe}
          onClose={() => setShowSetup(false)}
        />
      )}

      {showStats && (
        <StatsPanel
          data={{ ...data, bankroll: g.bankroll }}
          canReset={canReset}
          onClose={() => setShowStats(false)}
          onReset={onResetStats}
        />
      )}

      {!ready && !apiError && !showSetup && (
        <div className="overlay" role="status">
          <span className="spinner" aria-hidden="true" /> Loading the shoe…
        </div>
      )}

      {apiError && (
        <div className="overlay overlay--error" role="alertdialog" aria-labelledby="err-title" aria-describedby="err-msg">
          <div className="modal__card">
            <h2 id="err-title">Couldn&apos;t reach the cards</h2>
            <p id="err-msg">{apiError.message}</p>
            <div className="modal__actions">
              <button type="button" className="btn btn--primary" onClick={apiError.retry} aria-label="Retry the request">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function labelOf(action) {
  if (action === 'insurance') return 'Take insurance'
  if (action === 'decline') return 'Decline insurance'
  return ACTION_LABEL[action] || action
}
