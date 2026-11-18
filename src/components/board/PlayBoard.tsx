import { useMemo } from 'react'
import { DragGhost, Piece } from './Piece'
import { useBoardDrag } from './useBoardDrag'
import type { PieceStyle } from '../../features/settings/settingsModel'
import { Chess, type Square } from 'chess.js'

const FILES = 'abcdefgh'

type PlayBoardProps = {
  fen: string
  flipped?: boolean
  theme?: string
  pieceStyle?: PieceStyle
  /** Colour that may be picked up and dragged. */
  turn?: 'w' | 'b'
  selected?: Square | null
  targets?: Square[]
  lastMove?: { from: Square; to: Square } | null
  /** A square to point at (training hint). */
  hint?: Square | null
  /** Briefly marks the board as "wrong move". */
  shake?: boolean
  textPresentation?: boolean
  disabled?: boolean
  label?: string
  onSquare: (square: Square) => void
}

/** Clickable board used by the Training Center. Reuses the Analysis Studio board styles. */
export function PlayBoard({ fen, flipped = false, theme = 'classic', pieceStyle = 'classic', turn, selected = null, targets = [], lastMove = null, hint = null, shake = false, textPresentation = false, disabled = false, label = 'Chess board', onSquare }: PlayBoardProps) {
  const grid = useMemo(() => {
    const rows = new Chess(fen).board()
    return flipped ? [...rows].reverse().map((row) => [...row].reverse()) : rows
  }, [fen, flipped])

  const { drag, bind, consumeClick } = useBoardDrag({
    canDrag: (square) => !disabled && Boolean(turn) && new Chess(fen).get(square as Square)?.color === turn,
    onDragStart: (square) => { if (selected !== square) onSquare(square as Square) },
    onDrop: (_from, to) => onSquare(to as Square),
  })
  const dragPiece = drag ? new Chess(fen).get(drag.from as Square) : null

  return (
    <div className={`chess-board-wrap${shake ? ' board-shake' : ''}`}>
      <div className={`chess-board theme-${theme}`} role="grid" aria-label={label}>
        {grid.flatMap((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const rank = flipped ? rowIndex + 1 : 8 - rowIndex
            const file = flipped ? 7 - colIndex : colIndex
            const square = `${FILES[file]}${rank}` as Square
            const light = (rowIndex + colIndex) % 2 === 0
            const classes = [
              'board-square',
              light ? 'light' : 'dark',
              selected === square ? 'selected' : '',
              targets.includes(square) ? 'legal-target' : '',
              lastMove && (lastMove.from === square || lastMove.to === square) ? 'last-move' : '',
              hint === square ? 'hint-square' : '',
              turn && piece?.color === turn && !disabled ? 'can-drag' : '',
              drag?.from === square ? 'drag-source' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={square}
                role="gridcell"
                disabled={disabled}
                aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
                className={classes}
                data-square={square}
                {...bind(square)}
                onClick={() => { if (!consumeClick()) onSquare(square) }}
              >
                {piece && <Piece color={piece.color} type={piece.type} style={pieceStyle} textPresentation={textPresentation} />}
                {colIndex === 0 && <small className="rank-coordinate">{rank}</small>}
                {rowIndex === 7 && <small className="file-coordinate">{FILES[file]}</small>}
              </button>
            )
          }),
        )}
      </div>
      {drag && dragPiece && <DragGhost x={drag.x} y={drag.y} size={drag.size} color={dragPiece.color} type={dragPiece.type} style={pieceStyle} textPresentation={textPresentation} />}
    </div>
  )
}
