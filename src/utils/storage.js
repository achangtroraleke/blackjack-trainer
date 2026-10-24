// Single versioned localStorage record for everything the trainer persists.

export const STORAGE_KEY = 'bjTrainer_v1'
export const START_BANKROLL = 1000

export const defaultData = () => ({
  version: 1,
  setupDone: false,
  deckCount: 6,
  settings: {
    practice: false,
    showCount: true,
    showTips: true,
    trainer: false,
    advisorOpen: true,
    showChart: false,
  },
  bankroll: START_BANKROLL,
  stats: { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, surrenders: 0, net: 0 },
  strategy: { correct: 0, total: 0 },
  countAcc: { correct: 0, total: 0 },
  // Last 50 hands, oldest first: { id, result, bet, profit, tc, followed, bankroll }
  history: [],
  // Current shoe so a refresh resumes: { deckId, remaining, deckCount, running, seen, hole }
  shoe: null,
})

export const HISTORY_LIMIT = 50

const RESULT_LABEL = {
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
  blackjack: 'Blackjack',
  bust: 'Bust',
  surrender: 'Surrender',
}

const round2 = (n) => Math.round(n * 100) / 100

/** Fold one finished round into the persisted stats. Pure, so it is easy to test. */
export function applyRound(data, summary, ctx) {
  const stats = { ...data.stats }
  stats.hands += 1
  stats.net = round2(stats.net + summary.profit)
  switch (summary.result) {
    case 'blackjack':
      stats.blackjacks += 1
      break
    case 'win':
      stats.wins += 1
      break
    case 'push':
      stats.pushes += 1
      break
    case 'surrender':
      stats.surrenders += 1
      break
    default:
      stats.losses += 1 // loss and bust
  }
  const entry = {
    id: stats.hands,
    result: RESULT_LABEL[summary.result] || 'Loss',
    bet: summary.bet,
    profit: round2(summary.profit),
    tc: ctx.startTc,
    followed: ctx.decisions.total > 0 ? ctx.decisions.followed : null,
    bankroll: ctx.bankroll,
  }
  return {
    ...data,
    stats,
    bankroll: ctx.bankroll,
    history: [...data.history, entry].slice(-HISTORY_LIMIT),
  }
}
