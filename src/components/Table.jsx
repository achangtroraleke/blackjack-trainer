import Hand from './Hand.jsx'

/** Green felt table: dealer on top, player hands at the bottom. */
export default function Table({ game, shuffling, busy }) {
  const { dealer, hands, active, phase, message, summary } = game
  const inRound = phase !== 'betting'
  const outcomeClass = summary ? `banner--${summary.result}` : ''

  return (
    <div className="table" aria-live="polite">
      {shuffling && (
        <div className="shuffle-notice" role="status">
          <span className="spinner" aria-hidden="true" /> Shuffling… count reset
        </div>
      )}

      <div className="table__dealer">
        <Hand
          title="Dealer"
          cards={dealer.cards}
          hideSecond={dealer.hidden && dealer.cards.length > 1}
          outcome={null}
        />
      </div>

      <div className="table__middle">
        {message ? (
          <div className={`banner ${outcomeClass}`} role="status">
            {message}
          </div>
        ) : (
          <div className="banner banner--idle">
            {phase === 'betting' && 'Place your bet'}
            {phase === 'insurance' && 'Dealer shows an Ace. Insurance?'}
            {phase === 'player' && (busy ? 'Dealing…' : 'Your move')}
            {phase === 'dealer' && "Dealer's turn…"}
          </div>
        )}
        <p className="table__rules">Dealer stands on soft 17 · Blackjack pays 3:2 · Late surrender</p>
      </div>

      <div className="table__player">
        {!inRound && <Hand title="You" cards={[]} />}
        {inRound &&
          hands.map((h, i) => (
            <Hand
              key={i}
              title={hands.length > 1 ? `Hand ${i + 1}` : 'You'}
              cards={h.cards}
              bet={h.bet}
              outcome={h.outcome}
              active={phase === 'player' && i === active && hands.length > 1}
            />
          ))}
      </div>
    </div>
  )
}
