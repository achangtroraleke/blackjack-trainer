import { useState } from 'react'
import { DECK_OPTIONS } from '../utils/cards.js'

function Toggle({ id, label, hint, checked, onChange }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

/** Deck count selection plus trainer settings. Changing the deck count starts a new shoe. */
export default function SetupModal({ firstRun, deckCount, canChangeDecks, settings, onSettings, onStart, onClose }) {
  const [decks, setDecks] = useState(deckCount)
  const changed = decks !== deckCount

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className="modal__card">
        <h2 id="setup-title">{firstRun ? 'Welcome to the Blackjack Trainer' : 'Setup & settings'}</h2>
        <p className="modal__lead">
          Learn Hi-Lo card counting with live odds. Educational use only. Chips are virtual.
        </p>

        <fieldset className="decks" disabled={!canChangeDecks}>
          <legend>Decks in the shoe</legend>
          <div className="decks__options" role="radiogroup" aria-label="Number of decks">
            {DECK_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={decks === n}
                className={`deck-opt ${decks === n ? 'is-on' : ''}`}
                onClick={() => setDecks(n)}
                aria-label={`${n} ${n === 1 ? 'deck' : 'decks'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <small>
            {canChangeDecks
              ? firstRun
                ? 'Casinos mostly deal 6 or 8 decks. Fewer decks means bigger count swings.'
                : changed
                  ? 'Changing the deck count starts a new shoe and resets the running count (stats are kept).'
                  : 'Reshuffles automatically when about 25% of the shoe remains.'
              : 'Finish the current hand to change the number of decks.'}
          </small>
        </fieldset>

        <div className="settings">
          <Toggle
            id="set-practice"
            label="Count practice"
            hint="Hides the count. Enter your guess and check it to track accuracy."
            checked={settings.practice}
            onChange={(v) => onSettings({ practice: v })}
          />
          <Toggle
            id="set-showcount"
            label="Show count"
            hint="Display the running and true count (when practice is off)."
            checked={settings.showCount}
            onChange={(v) => onSettings({ showCount: v })}
          />
          <Toggle
            id="set-tips"
            label="Show tips"
            hint="Plain-English explanations and bet-size suggestions."
            checked={settings.showTips}
            onChange={(v) => onSettings({ showTips: v })}
          />
          <Toggle
            id="set-trainer"
            label="Strategy trainer"
            hint="Instant feedback when your play differs from the recommendation."
            checked={settings.trainer}
            onChange={(v) => onSettings({ trainer: v })}
          />
        </div>

        <div className="modal__actions">
          {!firstRun && (
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => (canChangeDecks && (firstRun || changed) ? onStart(decks) : onClose())}
          >
            {firstRun ? 'Start playing' : changed && canChangeDecks ? 'Start new shoe' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
