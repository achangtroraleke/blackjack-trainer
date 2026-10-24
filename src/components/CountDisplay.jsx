import { useState } from 'react'
import { formatSigned } from '../utils/cards.js'

/**
 * Hi-Lo count readout. In Count Practice mode the numbers stay hidden until the user
 * checks a guess (scored) or reveals them (not scored).
 */
export default function CountDisplay({
  running,
  trueCount,
  decksLeft,
  cardsLeft,
  shown,
  practice,
  countAcc,
  lastGuess,
  onGuess,
  onReveal,
}) {
  const [guess, setGuess] = useState('')
  const accPct = countAcc.total ? Math.round((countAcc.correct / countAcc.total) * 100) : null

  const submit = (e) => {
    e.preventDefault()
    if (guess.trim() === '' || Number.isNaN(Number(guess))) return
    onGuess(Number(guess))
    setGuess('')
  }

  return (
    <section className="panel count" aria-label="Hi-Lo count">
      <h2 className="panel__title">Hi-Lo count</h2>
      <dl className="count__grid">
        <div>
          <dt>Running</dt>
          <dd data-testid="running-count">{shown ? formatSigned(running) : '•••'}</dd>
        </div>
        <div>
          <dt>True</dt>
          <dd data-testid="true-count">{shown ? formatSigned(trueCount) : '•••'}</dd>
        </div>
        <div>
          <dt>Decks left</dt>
          <dd>{decksLeft.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Cards left</dt>
          <dd>{cardsLeft}</dd>
        </div>
      </dl>

      {practice && (
        <form className="count__practice" onSubmit={submit}>
          <label htmlFor="count-guess">Your running count</label>
          <div className="controls__row">
            <input
              id="count-guess"
              className="input"
              type="number"
              inputMode="numeric"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="e.g. +3"
              aria-label="Enter your running count guess"
            />
            <button type="submit" className="btn btn--primary" disabled={guess.trim() === ''} aria-label="Check my count">
              Check my count
            </button>
          </div>
          {!shown && (
            <button type="button" className="link-btn" onClick={onReveal} aria-label="Reveal the count without scoring">
              Just reveal it (not scored)
            </button>
          )}
          {lastGuess && (
            <p className={`count__result ${lastGuess.correct ? 'ok' : 'bad'}`} role="status">
              {lastGuess.correct
                ? `✅ Correct! The running count is ${formatSigned(lastGuess.actual)}.`
                : `❌ You said ${formatSigned(lastGuess.guess)}; the running count is ${formatSigned(lastGuess.actual)}.`}
            </p>
          )}
          <p className="count__acc">
            Count accuracy: {countAcc.correct}/{countAcc.total}
            {accPct != null ? ` (${accPct}%)` : ''}
          </p>
        </form>
      )}
    </section>
  )
}
