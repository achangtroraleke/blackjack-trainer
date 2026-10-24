// Plain-English explanations for the advisor.

import { handValue, rankOf, isPair, formatSigned } from './cards.js'

export const ACTION_LABEL = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double down',
  split: 'Split',
  surrender: 'Surrender',
}
const VERB = { hit: 'hit', stand: 'stand', double: 'double down', split: 'split', surrender: 'surrender' }

export const upName = (up) => (up === 1 ? 'Ace' : String(up))

// Approximate dealer bust % by upcard, used only until the exact numbers arrive.
const APPROX_BUST = { 2: 35, 3: 37, 4: 40, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 21, 1: 17 }

const pct = (x) => `${Math.round(x * 100)}%`

function pairReason(r, up) {
  const u = upName(up)
  if (r === 1) return 'Aces are the best hand to split: a lone 12 is weak, but each Ace can become a strong 21 with any ten.'
  if (r === 8) return `16 is the worst hard total in the game. Splitting turns it into two 8s, each a much better starting point${up >= 9 || up === 1 ? ` even against a ${u}` : ''}.`
  if (r === 9) return `Two 9s make 18, but against a ${u} two fresh 9s beat standing on 18.`
  if (r === 7) return `A pair of 7s is only 14; against a weak ${u} you get more value splitting.`
  if (r === 6) return `12 is a poor total and the dealer's ${u} is weak, so split to get two shots at a good hand.`
  if (r === 4) return `The dealer's ${u} is weak, and double after split makes two hands starting from 4 worthwhile.`
  if (r === 2 || r === 3) return `Small pairs are weak as a total, and the dealer's ${u} is vulnerable, so split.`
  return `Splitting is the best play against the dealer's ${u}.`
}

function deviationWhy(action, baseAction, high) {
  if (action === 'stand') {
    return high
      ? 'A ten-rich shoe makes your next card likely to bust you, so standing becomes better.'
      : 'Standing is the better play at this count.'
  }
  if (action === 'double') return 'A ten-rich shoe makes your one extra card likely to be strong, so more money should go out.'
  if (action === 'surrender') return 'A ten-rich shoe makes the dealer\'s strong hands more likely, so give up half the bet.'
  if (action === 'split') return 'The ten-rich shoe makes the dealer more likely to bust, so two hands starting from a ten are worth it.'
  if (action === 'hit') return 'The shoe is not rich enough in tens anymore, so the basic-strategy play is not worth the risk.'
  return `The count says ${VERB[action]} instead of ${VERB[baseAction]}.`
}

export function buildTip({ rec, cards, up, analysis, tc, maskCount = false }) {
  if (!rec) return ''
  const ranks = cards.map(rankOf)
  const hv = handValue(ranks)
  const u = upName(up)
  const bustPct = analysis?.dealer ? pct(analysis.dealer.bust) : `about ${APPROX_BUST[up]}%`
  const kind = hv.soft ? `soft ${hv.total}` : `${hv.total}`
  const parts = []

  if (rec.source === 'deviation' && rec.deviation) {
    const d = rec.deviation
    const high = d.index > 0 || d.active
    const countText = maskCount
      ? 'The count calls for an index play here'
      : `True count is ${formatSigned(tc)} (index ${formatSigned(d.index)})`
    parts.push(
      `${countText}: ${VERB[rec.action]} ${kind} vs ${u} instead of the basic-strategy ${VERB[rec.baseAction]}. ${deviationWhy(rec.action, rec.baseAction, high)}`,
    )
  } else {
    switch (rec.action) {
      case 'stand':
        if (up >= 2 && up <= 6) {
          parts.push(`Dealer shows a ${u} and busts ${bustPct} of the time, so stand on ${kind} and let the dealer take the risk.`)
        } else {
          parts.push(`Stand on ${kind}: against a ${u} the risk of busting by hitting outweighs the small chance of improving.`)
        }
        break
      case 'hit':
        if (hv.soft) {
          parts.push(`Your soft ${hv.total} can't bust on one card, and standing loses too often against a ${u}, so take a card.`)
        } else {
          parts.push(`Dealer shows a strong ${u} (busts only ${bustPct}), so standing on ${kind} loses more often than hitting. Take a card.`)
        }
        break
      case 'double':
        parts.push(`${hv.soft ? 'Soft ' : ''}${hv.total} against a ${u} is a favorable spot (dealer busts ${bustPct}), so put more money out with one more card.`)
        break
      case 'split':
        parts.push(pairReason(ranks[0], up))
        break
      case 'surrender':
        parts.push(
          `${kind} against a ${u} wins too rarely to play on. Surrendering costs only half your bet, which beats the expected loss from playing it out.`,
        )
        break
      default:
        break
    }
    if (rec.watch) {
      parts.push(
        maskCount
          ? 'Heads-up: this hand has a count-based index play.'
          : `Heads-up: at TC ${rec.watch.index >= 0 ? '≥' : '≥'} ${formatSigned(rec.watch.index)} the play is ${VERB[rec.watch.hi]}, below it ${VERB[rec.watch.lo]}.`,
      )
    }
  }

  if (analysis?.best && analysis.best !== rec.action) {
    const ev = analysis.actions[analysis.best]?.ev
    if (typeof ev === 'number') {
      parts.push(`The shoe-composition math marginally prefers ${VERB[analysis.best]} (EV ${ev >= 0 ? '+' : ''}${ev.toFixed(3)}); the recommendation above is the book play.`)
    }
  }
  return parts.join(' ')
}

export function insuranceTip({ tc, maskCount, p10, take }) {
  const p = p10 != null ? ` The shoe holds a ten for the hole card with probability ${pct(p10)} (break-even is 33%).` : ''
  if (maskCount) return `${take ? 'The count says take insurance.' : 'The count says decline insurance.'}${p}`
  return take
    ? `True count is ${formatSigned(tc)} (≥ +3), so the shoe is rich in tens: take insurance.${p}`
    : `True count is ${formatSigned(tc)} (below +3), so insurance is a losing bet: decline.${p}`
}

export function describePair(cards) {
  return isPair(cards) ? 'pair' : 'hand'
}
