import Card from './Card.jsx'
import { handValue } from '../utils/cards.js'
import { outcomeLabel } from '../utils/blackjackReducer.js'

function totalText(cards, hideSecond) {
  const shown = hideSecond ? cards.slice(0, 1) : cards
  if (shown.length === 0) return ''
  const v = handValue(shown)
  if (v.bust) return `${v.total} (bust)`
  if (v.soft && v.total !== 21) return `Soft ${v.total}`
  return String(v.total)
}

/** A row of cards with its total, bet and result badge. */
export default function Hand({ title, cards, hideSecond = false, bet, outcome, active = false }) {
  const total = totalText(cards, hideSecond)
  return (
    <section className={`hand ${active ? 'hand--active' : ''}`} aria-label={title}>
      <div className="hand__meta">
        <span className="hand__title">{title}</span>
        {total && (
          <span className="hand__total" aria-label={`Total ${total}`}>
            {total}
          </span>
        )}
        {bet != null && <span className="hand__bet">Bet ${bet.toLocaleString()}</span>}
        {outcome && <span className={`badge badge--${outcome}`}>{outcomeLabel(outcome)}</span>}
      </div>
      <div className="hand__cards">
        {cards.length === 0 && <div className="card card--slot" aria-hidden="true" />}
        {cards.map((c, i) => (
          <Card key={`${c.code}-${i}`} card={c} index={i} hidden={hideSecond && i === 1} />
        ))}
      </div>
    </section>
  )
}
