import { useState } from 'react'
import { formatSigned } from '../utils/cards.js'

const money = (n) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const pctOf = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')

function BankrollChart({ history, start }) {
  if (history.length === 0) return <p className="stats__empty">Play a few hands to see your bankroll over time.</p>
  const first = history[0]
  const series = [first.bankroll - first.profit, ...history.map((h) => h.bankroll)]
  const W = 600
  const H = 160
  const pad = 12
  const min = Math.min(...series, start)
  const max = Math.max(...series, start)
  const span = max - min || 1
  const x = (i) => pad + (i / Math.max(1, series.length - 1)) * (W - pad * 2)
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2)
  const d = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  return (
    <figure className="stats__chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bankroll over the last ${history.length} hands, from $${Math.round(series[0])} to $${Math.round(last)}`}>
        <line x1={pad} x2={W - pad} y1={y(start)} y2={y(start)} className="chart-base" />
        <path d={d} className="chart-line" fill="none" />
        <circle cx={x(series.length - 1)} cy={y(last)} r="4" className="chart-dot" />
        <text x={pad} y={12} className="chart-text">${Math.round(max).toLocaleString()}</text>
        <text x={pad} y={H - 2} className="chart-text">${Math.round(min).toLocaleString()}</text>
      </svg>
      <figcaption>Bankroll over the last {history.length} hands (dashed line = $1,000 start)</figcaption>
    </figure>
  )
}

/** Lifetime stats, bankroll chart, last-50 history and a confirmed reset. */
export default function StatsPanel({ data, canReset = true, onClose, onReset }) {
  const [confirming, setConfirming] = useState(false)
  const { stats, strategy, countAcc, history, bankroll } = data
  const recent = [...history].reverse()

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Statistics">
      <div className="modal__card modal__card--wide">
        <div className="panel__head">
          <h2 className="panel__title">Statistics</h2>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label="Close statistics">
            Close
          </button>
        </div>

        <dl className="stats__grid">
          <div><dt>Bankroll</dt><dd>${bankroll.toLocaleString()}</dd></div>
          <div><dt>Net profit/loss</dt><dd className={stats.net >= 0 ? 'pos' : 'neg'}>{money(stats.net)}</dd></div>
          <div><dt>Hands</dt><dd>{stats.hands}</dd></div>
          <div><dt>Win rate</dt><dd>{pctOf(stats.wins + stats.blackjacks, stats.hands)}</dd></div>
          <div><dt>Wins</dt><dd>{stats.wins}</dd></div>
          <div><dt>Losses</dt><dd>{stats.losses}</dd></div>
          <div><dt>Pushes</dt><dd>{stats.pushes}</dd></div>
          <div><dt>Blackjacks</dt><dd>{stats.blackjacks}</dd></div>
          <div><dt>Surrenders</dt><dd>{stats.surrenders}</dd></div>
          <div>
            <dt>Strategy accuracy</dt>
            <dd>
              {strategy.correct}/{strategy.total} <small>{pctOf(strategy.correct, strategy.total)}</small>
            </dd>
          </div>
          <div>
            <dt>Count accuracy</dt>
            <dd>
              {countAcc.correct}/{countAcc.total} <small>{pctOf(countAcc.correct, countAcc.total)}</small>
            </dd>
          </div>
        </dl>

        <BankrollChart history={history} start={1000} />

        <h3 className="stats__sub">Last {history.length} hands</h3>
        {recent.length === 0 ? (
          <p className="stats__empty">No hands yet.</p>
        ) : (
          <div className="stats__scroll">
            <table className="history">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Result</th>
                  <th scope="col">Bet</th>
                  <th scope="col">Profit</th>
                  <th scope="col" title="True count at the start of the hand">TC</th>
                  <th scope="col" title="Followed the recommended play on every decision">Book play</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((h) => (
                  <tr key={h.id}>
                    <td>{h.id}</td>
                    <td>{h.result}</td>
                    <td>${h.bet}</td>
                    <td className={h.profit >= 0 ? 'pos' : 'neg'}>{money(h.profit)}</td>
                    <td>{formatSigned(h.tc)}</td>
                    <td>{h.followed == null ? '—' : h.followed ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal__actions">
          {!canReset && <small className="stats__empty">Finish the current hand to reset.</small>}
          <button
            type="button"
            className="btn btn--danger"
            disabled={!canReset}
            onClick={() => setConfirming(true)}
            aria-label="Reset stats"
          >
            Reset stats
          </button>
        </div>

        {confirming && (
          <div className="modal modal--inner" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-desc">
            <div className="modal__card">
              <h3 id="reset-title">Reset all stats?</h3>
              <p id="reset-desc">
                This clears your hand history, win/loss record, accuracy and bankroll (back to $1,000). Your deck count,
                settings and current shoe are kept.
              </p>
              <div className="modal__actions">
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    setConfirming(false)
                    onReset()
                  }}
                >
                  Yes, reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
