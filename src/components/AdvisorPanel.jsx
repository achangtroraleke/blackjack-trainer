import { ACTION_LABEL } from '../utils/tips.js'

const ORDER = ['hit', 'stand', 'double', 'split', 'surrender']
const pct = (x) => `${(x * 100).toFixed(1)}%`
const fmtEv = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(3)}`

/** Collapsible strategy advisor: recommended play, per-action odds and EV, and a plain-English tip. */
export default function AdvisorPanel({
  open,
  onToggle,
  phase,
  rec,
  handDesc,
  upLabel,
  advisor,
  tip,
  showTips,
  insurance,
  betTip,
  feedback,
  trainerOn,
}) {
  const result = advisor.result
  const rows = result ? ORDER.filter((a) => result.actions[a]) : []

  return (
    <section className="panel advisor" aria-label="Strategy advisor">
      <h2 className="panel__title">
        <button
          type="button"
          className="panel__toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="advisor-body"
          aria-label={open ? 'Collapse strategy advisor' : 'Expand strategy advisor'}
        >
          <span>Strategy advisor</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </h2>

      {open && (
        <div id="advisor-body" className="advisor__body">
          {trainerOn && feedback && (
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

          {phase === 'insurance' && insurance && (
            <div className="advisor__rec">
              <span className="advisor__label">Insurance</span>
              <span className={`advisor__action ${insurance.take ? 'is-take' : 'is-decline'}`}>
                {insurance.take ? 'Take insurance' : 'Decline insurance'}
              </span>
              {showTips && <p className="advisor__tip">{insurance.tip}</p>}
            </div>
          )}

          {phase === 'player' && rec && (
            <>
              <div className="advisor__rec">
                <span className="advisor__label">
                  {handDesc} vs {upLabel}
                </span>
                <span className={`advisor__action act-${rec.action}`} data-testid="recommended-action">
                  {ACTION_LABEL[rec.action]}
                </span>
                {rec.source === 'deviation' && <span className="tag tag--dev">Count deviation</span>}
              </div>

              <div className="odds" aria-live="polite">
                {advisor.loading && !result && <p className="odds__loading">Calculating odds from the shoe…</p>}
                {advisor.error && <p className="odds__error">Could not calculate odds: {advisor.error}</p>}
                {result && (
                  <table className={advisor.loading ? 'odds__table is-stale' : 'odds__table'}>
                    <caption className="sr-only">Win, push and loss chances and expected value per action</caption>
                    <thead>
                      <tr>
                        <th scope="col">Action</th>
                        <th scope="col">Win</th>
                        <th scope="col">Push</th>
                        <th scope="col">Loss</th>
                        <th scope="col" title="Expected value per unit of the original bet">
                          EV
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => {
                        const o = result.actions[a]
                        const best = a === result.best
                        return (
                          <tr key={a} className={`${best ? 'is-best' : ''} ${a === rec.action ? 'is-rec' : ''}`}>
                            <th scope="row">
                              {ACTION_LABEL[a]}
                              {best && <span className="tag tag--best">best EV</span>}
                            </th>
                            <td>{a === 'surrender' ? '—' : pct(o.w)}</td>
                            <td>{a === 'surrender' ? '—' : pct(o.p)}</td>
                            <td>{a === 'surrender' ? '100%' : pct(o.l)}</td>
                            <td className={o.ev >= 0 ? 'pos' : 'neg'}>{fmtEv(o.ev)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {result && (
                  <p className="odds__foot">
                    Dealer busts {pct(result.dealer.bust)} · odds from {result.unknown} unseen cards. EV is per $1 of the
                    original bet; doubles and splits count the extra money.
                  </p>
                )}
              </div>

              {showTips && tip && (
                <p className="advisor__tip">
                  <strong>Tip:</strong> {tip}
                </p>
              )}
            </>
          )}

          {phase !== 'player' && phase !== 'insurance' && (
            <p className="advisor__idle">
              {phase === 'betting'
                ? 'Place a bet and deal. The advisor will show the best play and odds for every hand.'
                : 'Round finished. Advisor resumes on the next hand.'}
            </p>
          )}

          {betTip && showTips && (phase === 'betting' || phase === 'settled') && <p className="advisor__bet">{betTip}</p>}
        </div>
      )}
    </section>
  )
}

function labelOf(action) {
  if (action === 'insurance') return 'Take insurance'
  if (action === 'decline') return 'Decline insurance'
  return ACTION_LABEL[action] || action
}
