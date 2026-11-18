import { winPercent } from './reviewModel'

type EvalGraphProps = {
  /** White-relative centipawns, one per position (may still be filling up while the review runs). */
  values: number[]
  /** Number of plies in the game (positions = plies + 1). */
  plies: number
  cursor: number
  onSelect: (ply: number) => void
}

const WIDTH = 400
const HEIGHT = 100

/** Evaluation graph: the light area is White's share of the winning chances at each ply. */
export function EvalGraph({ values, plies, cursor, onSelect }: EvalGraphProps) {
  const x = (ply: number) => (plies === 0 ? 0 : (ply / plies) * WIDTH)
  const y = (cp: number) => HEIGHT - (winPercent(cp) / 100) * HEIGHT
  const points = values.map((cp, ply) => `${x(ply).toFixed(1)},${y(cp).toFixed(1)}`)
  const area = points.length > 1 ? `M${x(0)},${HEIGHT} L${points.join(' L')} L${x(points.length - 1).toFixed(1)},${HEIGHT} Z` : ''

  return (
    <div className="eval-graph">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Evaluation graph"
        onClick={(event) => {
          if (plies === 0) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width === 0) return
          const ratio = (event.clientX - rect.left) / rect.width
          onSelect(Math.max(0, Math.min(plies, Math.round(ratio * plies))))
        }}
      >
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} className="graph-bg" />
        {area && <path d={area} className="graph-area" />}
        {points.length > 1 && <polyline points={points.join(' ')} className="graph-line" vectorEffect="non-scaling-stroke" />}
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} className="graph-mid" vectorEffect="non-scaling-stroke" />
        <line x1={x(cursor)} y1="0" x2={x(cursor)} y2={HEIGHT} className="graph-cursor" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}
