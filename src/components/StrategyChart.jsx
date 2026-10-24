import {
  getTables,
  DEALER_LABELS,
  HARD_ROWS,
  SOFT_ROWS,
  PAIR_ROWS,
  hardLabel,
  softLabel,
  pairLabel,
} from '../utils/strategy.js'

const SHOW = { H: 'H', S: 'S', D: 'D', Ds: 'Ds', P: 'P', Rh: 'R', '-': '' }

function Grid({ title, rows, label, cells, section, highlight, note }) {
  return (
    <div className="chart__block">
      <h3>{title}</h3>
      <table className="chart__table">
        <thead>
          <tr>
            <th scope="col" aria-label="Your hand" />
            {DEALER_LABELS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row">{label(r)}</th>
              {cells(r).map((tok, c) => {
                const hit = highlight && highlight.section === section && highlight.row === r && highlight.col === c
                return (
                  <td key={c} className={`cell cell--${tok === '-' ? 'none' : tok} ${hit ? 'cell--now' : ''}`} aria-current={hit ? 'true' : undefined}>
                    {SHOW[tok]}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="chart__note">{note}</p>}
    </div>
  )
}

/** Toggleable basic strategy chart; highlights the cell for the current hand. */
export default function StrategyChart({ decks, highlight, onClose }) {
  const T = getTables(decks)
  const surrenderRows = [15, 16]
  const surrCell = (r) => T.hard[r].map((t) => (t === 'Rh' ? 'Rh' : '-'))

  return (
    <section className="panel chart" aria-label="Basic strategy chart">
      <div className="panel__head">
        <h2 className="panel__title">Basic strategy ({decks} {decks === 1 ? 'deck' : 'decks'})</h2>
        <button type="button" className="btn btn--small" onClick={onClose} aria-label="Hide strategy chart">
          Hide
        </button>
      </div>
      <p className="chart__legend">
        <span className="cell cell--H">H</span> Hit <span className="cell cell--S">S</span> Stand{' '}
        <span className="cell cell--D">D</span> Double (else hit) <span className="cell cell--Ds">Ds</span> Double (else stand){' '}
        <span className="cell cell--P">P</span> Split <span className="cell cell--Rh">R</span> Surrender (else hit)
      </p>
      <div className="chart__grids">
        <Grid
          title="Hard totals"
          rows={HARD_ROWS}
          label={hardLabel}
          cells={(r) => T.hard[r]}
          section="hard"
          highlight={highlight}
        />
        <Grid
          title="Soft totals"
          rows={SOFT_ROWS}
          label={softLabel}
          cells={(r) => T.soft[r]}
          section="soft"
          highlight={highlight}
        />
        <Grid
          title="Pairs"
          rows={PAIR_ROWS}
          label={pairLabel}
          cells={(r) => T.pairs[r]}
          section="pairs"
          highlight={highlight}
          note="Blank = don't split; play the hand as a hard or soft total. Never split 5s or 10s."
        />
        <Grid
          title="Late surrender"
          rows={surrenderRows}
          label={hardLabel}
          cells={surrCell}
          section="hard"
          highlight={highlight}
          note="Hard 15 vs 10 and hard 16 vs 9, 10, A. Stand on 17 vs A (dealer stands soft 17). Highlight shows the matching hard-total cell."
        />
      </div>
      <p className="chart__note">Chart shows basic strategy only. Count-based deviations (Illustrious 18, Fab 4) appear in the advisor.</p>
    </section>
  )
}
