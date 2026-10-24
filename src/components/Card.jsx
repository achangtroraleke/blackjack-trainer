import { BACK_IMAGE } from '../utils/cards.js'

const SUIT = { SPADES: 'spades', HEARTS: 'hearts', DIAMONDS: 'diamonds', CLUBS: 'clubs' }

/** One playing card. `hidden` shows the card back (the dealer's hole card). */
export default function Card({ card, hidden = false, index = 0 }) {
  const src = hidden ? BACK_IMAGE : card.image
  const label = hidden ? 'Face-down card' : `${String(card.value).toLowerCase()} of ${SUIT[card.suit] || card.suit}`
  return (
    <img
      key={hidden ? 'back' : 'front'}
      className={`card ${hidden ? 'card--back' : 'card--front'}`}
      style={{ '--i': index }}
      src={src}
      alt={label}
      width="226"
      height="314"
      draggable="false"
    />
  )
}
