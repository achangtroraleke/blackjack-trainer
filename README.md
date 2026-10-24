# Blackjack Card Counting Trainer

A frontend-only React app for practising Hi-Lo card counting and basic strategy. Cards come from the
[Deck of Cards API](https://deckofcardsapi.com/); everything else (odds, strategy, stats) runs in your browser.

> **Disclaimer:** this project is for **educational purposes only**. Chips are virtual, nothing here is gambling
> or financial advice, and card counting does not guarantee winnings. Counting is legal in most places, but casinos
> may ask counters to leave.

## Setup

```bash
npm install
npm run dev        # start the dev server (Vite)
npm test           # run the Vitest unit tests
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Requires Node 18+ and internet access (for the Deck of Cards API).

## How to play

1. Pick the number of decks (1, 2, 4, 6 or 8) in the setup dialog. Changing it later starts a new shoe and resets the
   running count, but keeps your lifetime stats.
2. Place a bet with the chips and press **Deal**. Use Hit / Stand / Double / Split / Surrender; buttons are only
   enabled when the move is legal.
3. Watch the **Strategy advisor** for the recommended play, the win / push / loss chances and EV of each legal action,
   and a plain-English tip. The best-EV action is highlighted.

Keyboard shortcuts: **H** hit, **S** stand, **D** double, **P** split, **R** surrender, **N** next hand.

### Trainer options (Setup dialog)

- **Count practice** hides the count. Type your running count and press *Check my count*; accuracy is tracked.
- **Show count** hides or shows the running/true count when practice is off.
- **Show tips** toggles the explanations and the bet-size suggestion.
- **Strategy trainer** gives instant ✅ / ❌ feedback on each decision (accuracy is tracked either way).
- **Chart** (header) toggles the basic strategy chart, which highlights the cell for your current hand.

## Rules used

- Dealer stands on soft 17 and peeks for blackjack (US style).
- Blackjack pays 3:2; insurance pays 2:1 (offered when the dealer shows an Ace).
- Double on any two cards, double after split allowed.
- Split once (maximum two hands); split aces receive one card each, and A + 10 after a split is 21, not blackjack.
- Late surrender (first two cards only, not after splitting).
- Reshuffle when about 25% of the shoe remains (penetration cut); the count resets on every shuffle.
- Bankroll starts at $1,000; bets are $5 to $500.

## Hi-Lo counting in 60 seconds

Assign each card a value as it is dealt:

| Cards | Value |
| --- | --- |
| 2, 3, 4, 5, 6 | +1 |
| 7, 8, 9 | 0 |
| 10, J, Q, K, A | −1 |

- **Running count** = the sum of the values of all cards seen since the shuffle (the dealer's hole card counts once it is
  revealed).
- **True count** = running count ÷ decks remaining (rounded to 1 decimal). It adjusts for how many cards are left, so a
  +6 running count with 3 decks left is a true count of +2.
- A high count means the shoe is rich in tens and aces, which favours the player: bet more, take insurance at
  **TC ≥ +3**, and make count-based "index" plays. A low count means you should bet the minimum.

The bet tip uses a simple spread: 1 unit at TC ≤ +1, 2 at +2, 4 at +3, 6 at +4 and 8 at +5 or more (1 unit = $10).

## How the advisor works

- **Recommended play** comes from basic strategy tables for the chosen deck count (`src/utils/strategy.js`), then the
  Hi-Lo index plays (Illustrious 18 and the Fab 4 surrenders) override it when the true count calls for it.
  Insurance follows the TC ≥ +3 rule.
- **Percentages and EV** are computed from the *unseen* cards: a full shoe minus every card you have seen. The dealer
  outcome distribution is calculated exactly by recursion over the remaining composition (`src/utils/probability.js`),
  assuming the dealer has peeked and has no blackjack. Hitting is evaluated with optimal continuation, doubling with one
  extra card, and splitting with each hand evaluated independently (double after split, no re-split). EV is per $1 of the
  original bet, so doubles and splits include the extra money at risk.
- The calculation runs in a **Web Worker** (`src/workers/advisor.worker.js`), so the interface never freezes.
- The dealer's hole card is **not** used in the calculation until it is revealed.

## Persistence

Everything is stored in `localStorage` under one versioned key, `bjTrainer_v1`: deck count and settings, bankroll,
lifetime stats, strategy and count accuracy, the last 50 hands, and the current shoe (deck id, cards remaining,
running count and the cards seen). On reload the saved shoe is validated against the API; if it has expired a new shoe is
created. Use *Stats → Reset stats* (with confirmation) to clear your record.

## Project layout

```
src/
  components/  SetupModal, Table, Hand, Card, Controls, AdvisorPanel, CountDisplay, StatsPanel, StrategyChart
  hooks/       useDeck (API + shoe), useBlackjack (reducer-based game machine), useLocalStorage, useCardCount, useAdvisor
  utils/       cards.js, strategy.js, probability.js, blackjackReducer.js, tips.js, storage.js (+ *.test.js)
  workers/     advisor.worker.js
```

## Tests

`npm test` runs Vitest unit tests for hand values, Hi-Lo counting and true count, strategy and deviation lookups, the
probability engine, the game reducer (payouts, splits, doubles, insurance, surrender), storage helpers, and an
end-to-end app test against a mocked Deck of Cards API.
# blackjack-trainer
