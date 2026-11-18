import { useId, useMemo, type PointerEvent, type MouseEvent } from 'react'
import { Piece } from './Piece'
import type { PieceStyle } from '../../features/settings/settingsModel'
import { Chess, type Square } from 'chess.js'

const FILES = 'abcdefgh'

type SquarePair = { from: Square; to: Square }
export type BoardArrow = SquarePair & { color: string; /** Thicker, softer arrow for the move that was actually played. */ played?: boolean }
export type BoardBadge = { square: Square; symbol: string; color: string; label?: string }

type StaticBoardProps = {
  fen: string
  flipped?: boolean
  theme?: string
  pieceStyle?: PieceStyle
  lastMove?: SquarePair | null
  /** Draws an arrow, e.g. the engine's suggestion for the position on the board. */
  arrow?: SquarePair | null
  /** Several coloured arrows (played move, better move, ...). Drawn in addition to `arrow`. */
  arrows?: BoardArrow[]
  /** Round icon in the corner of a square, like chess.com's move-quality icon. */
  badge?: BoardBadge | null
  /** Appends the text-presentation selector so phones do not render ♟ as an emoji. */
  textPresentation?: boolean
  label?: string
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void
}

/** Read-only board that reuses the Analysis Studio board styles. */
export function StaticBoard({ fen, flipped = false, theme = 'classic', pieceStyle = 'classic', lastMove = null, arrow = null, arrows = [], badge = null, textPresentation = false, label = 'Review board', onPointerDown, onContextMenu }: StaticBoardProps) {
  const grid = useMemo(() => {
    const rows = new Chess(fen).board()
    return flipped ? [...rows].reverse().map((row) => [...row].reverse()) : rows
  }, [fen, flipped])

  const center = (square: Square) => {
    const file = FILES.indexOf(square[0])
    const rank = Number(square[1])
    return { x: (flipped ? 7 - file : file) * 12.5 + 6.25, y: (flipped ? rank - 1 : 8 - rank) * 12.5 + 6.25 }
  }
  const uid = useId().replace(/:/g, '')
  const drawn: BoardArrow[] = [...(arrow ? [{ ...arrow, color: '#a8e063' }] : []), ...arrows]

  return (
    <div className="chess-board-wrap static-board">
      <div className={`chess-board theme-${theme}`} role="img" aria-label={label} onPointerDown={onPointerDown} onContextMenu={onContextMenu}>
        {grid.flatMap((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const rank = flipped ? rowIndex + 1 : 8 - rowIndex
            const file = flipped ? 7 - colIndex : colIndex
            const square = `${FILES[file]}${rank}` as Square
            const light = (rowIndex + colIndex) % 2 === 0
            const isLast = Boolean(lastMove && (lastMove.from === square || lastMove.to === square))
            return (
              <div key={square} data-square={square} className={`board-square ${light ? 'light' : 'dark'}${isLast ? ' last-move' : ''}`}>
                {piece && (
                  <Piece color={piece.color} type={piece.type} style={pieceStyle} textPresentation={textPresentation} />
                )}
                {badge && badge.square === square && <span className="move-badge" style={{ background: badge.color }} title={badge.label} aria-label={badge.label}>{badge.symbol}</span>}
                {colIndex === 0 && <small className="rank-coordinate">{rank}</small>}
                {rowIndex === 7 && <small className="file-coordinate">{FILES[file]}</small>}
              </div>
            )
          }),
        )}
      </div>
      {drawn.length > 0 && (
        <svg className="pv-arrows" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            {drawn.map((item, index) => <marker key={index} id={`${uid}-arrow-${index}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill={item.color} /></marker>)}
          </defs>
          {drawn.map((item, index) => {
            const start = center(item.from)
            const end = center(item.to)
            return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={item.color} strokeWidth={item.played ? 1.7 : 1.25} strokeLinecap="round" markerEnd={`url(#${uid}-arrow-${index})`} opacity={item.played ? 0.78 : 0.92} />
          })}
        </svg>
      )}
    </div>
  )
}
