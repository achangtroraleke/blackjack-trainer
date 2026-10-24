import { useEffect, useState } from 'react'
import { MIN_BET, MAX_BET, canOfferInsurance } from '../utils/blackjackReducer.js'

const CHIPS = [5, 10, 25, 100]

const ACTIONS = [
  { key: 'hit', label: 'Hit', hotkey: 'H', aria: 'Hit: take another card' },
  { key: 'stand', label: 'Stand', hotkey: 'S', aria: 'Stand: keep your hand' },
  { key: 'double', label: 'Double', hotkey: 'D', aria: 'Double down: double your bet and take one card' },
  { key: 'split', label: 'Split', hotkey: 'P', aria: 'Split your pair into two hands' },
  { key: 'surrender', label: 'Surrender', hotkey: 'R', aria: 'Surrender: give up half your bet' },
]

/** Bet panel, insurance prompt, action buttons and "next hand". */
export default function Controls({ game, legal, busy, actions, suggestedBet, bankrollLow, onRebuy }) {
  const { phase, bankroll, lastBet } = game
  const [bet, setBet] = useState(() => lastBet || 25)

  const maxBet = Math.min(MAX_BET, bankroll)
  const clamped = Math.max(0, Math.min(bet, maxBet))

  useEffect(() => {
    setBet((b) => Math.min(b, Math.max(MIN_BET, Math.min(MAX_BET, bankroll))))
  }, [bankroll])

  if (phase === 'betting') {
    if (bankrollLow) {
      return (
        <div className="controls controls--bet">
          <p className="controls__note">You&apos;re out of chips.</p>
          <button type="button" className="btn btn--primary" onClick={onRebuy} aria-label="Rebuy 1,000 dollars in chips">
            Rebuy $1,000
          </button>
        </div>
      )
    }
    const canDeal = !busy && clamped >= MIN_BET
    return (
      <div className="controls controls--bet">
        <div className="bet-display" aria-live="polite">
          <span className="bet-display__label">Bet</span>
          <span className="bet-display__amount">${clamped.toLocaleString()}</span>
        </div>
        <div className="chips" role="group" aria-label="Add chips to your bet">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip chip--${c}`}
              disabled={busy || clamped + c > maxBet}
              onClick={() => setBet(clamped + c)}
              aria-label={`Add ${c} dollars`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="controls__row">
          <button type="button" className="btn" disabled={busy} onClick={() => setBet(0)} aria-label="Clear bet">
            Clear
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !lastBet}
            onClick={() => setBet(Math.min(lastBet, maxBet))}
            aria-label="Repeat last bet"
          >
            Last bet
          </button>
          {suggestedBet != null && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setBet(Math.min(suggestedBet, maxBet))}
              aria-label={`Use the suggested bet of ${suggestedBet} dollars`}
            >
              Suggested ${suggestedBet}
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn--primary btn--deal"
          disabled={!canDeal}
          onClick={() => actions.deal(clamped)}
          aria-label={`Deal with a bet of ${clamped} dollars`}
        >
          Deal
        </button>
        <p className="controls__hint">Min ${MIN_BET} · Max ${MAX_BET}</p>
      </div>
    )
  }

  if (phase === 'insurance') {
    const affordable = canOfferInsurance(game)
    const cost = game.hands[0].bet / 2
    return (
      <div className="controls controls--insurance">
        <p className="controls__note">
          Insurance costs ${cost.toLocaleString()} and pays 2:1 if the dealer has blackjack.
        </p>
        <div className="controls__row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !affordable}
            onClick={() => actions.insurance(true)}
            aria-label={`Take insurance for ${cost} dollars`}
          >
            Take insurance
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => actions.insurance(false)} aria-label="Decline insurance">
            No thanks
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'settled') {
    return (
      <div className="controls controls--next">
        <button
          type="button"
          className="btn btn--primary btn--deal"
          disabled={busy}
          onClick={actions.nextHand}
          aria-label="Next hand (keyboard shortcut N)"
        >
          Next hand <kbd>N</kbd>
        </button>
      </div>
    )
  }

  return (
    <div className="controls controls--actions" role="group" aria-label="Player actions">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          className={`btn btn--action btn--${a.key}`}
          disabled={busy || !legal[a.key]}
          onClick={() => actions[a.key]()}
          aria-label={`${a.aria} (keyboard shortcut ${a.hotkey})`}
        >
          {a.label}
          <kbd>{a.hotkey}</kbd>
        </button>
      ))}
    </div>
  )
}
