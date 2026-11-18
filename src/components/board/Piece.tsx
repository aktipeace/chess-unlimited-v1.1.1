import { createPortal } from 'react-dom'
import type { PieceStyle } from '../../features/settings/settingsModel'

export const PIECE_SHAPES: Record<string, string> = {
  P: "<rect x=\"10\" y=\"36\" width=\"25\" height=\"4.5\" rx=\"2\"/><circle cx=\"22.5\" cy=\"13.5\" r=\"5.8\"/><path d=\"M16.5 36C16.5 29 19 26 20 22.5h5c1 3.5 3.5 6.5 3.5 13.5Z\"/><rect x=\"15.5\" y=\"21\" width=\"14\" height=\"3.4\" rx=\"1.7\"/>",
  R: "<rect x=\"10\" y=\"36\" width=\"25\" height=\"4.5\" rx=\"2\"/><path d=\"M14 36 15.6 18h13.8L31 36Z\"/><path d=\"M12.5 18.5V9h4.6v3.3h3.2V9h4.4v3.3h3.2V9h4.6v9.5Z\"/>",
  N: "<rect x=\"10\" y=\"36\" width=\"25\" height=\"4.5\" rx=\"2\"/><path d=\"M13.5 36C13 28 15 22.5 20.5 18.6 18 18 15.5 19.2 11.5 22.6 10.7 19.4 13 15.4 17.5 12.4L18.4 7l4.3 3.6C31.5 11.6 35 19 33 36Z\"/><circle cx=\"23.6\" cy=\"14.6\" r=\"1.3\" class=\"eye\"/>",
  B: "<rect x=\"10\" y=\"36\" width=\"25\" height=\"4.5\" rx=\"2\"/><path d=\"M22.5 6.5c5.6 4.6 7.2 10.8 3.6 15.8v1.6h4.6V27h-4.6c0 4 1.8 6.6 4.2 9h-15.6c2.4-2.4 4.2-5 4.2-9h-4.6v-3.1h4.6v-1.6C14.1 17.3 16.9 11.1 22.5 6.5Z\"/><path d=\"M22.5 11.5v7M19 15h7\" class=\"cut\"/>",
  Q: "<rect x=\"10\" y=\"36\" width=\"25\" height=\"4.5\" rx=\"2\"/><path d=\"M11 36 8.2 14.2l6.9 9.2 1.6-13.2 5.8 12.2 5.8-12.2 1.6 13.2 6.9-9.2L34 36Z\"/><circle cx=\"8\" cy=\"12.2\" r=\"2.3\"/><circle cx=\"16.7\" cy=\"8.6\" r=\"2.3\"/><circle cx=\"28.3\" cy=\"8.6\" r=\"2.3\"/><circle cx=\"37\" cy=\"12.2\" r=\"2.3\"/><circle cx=\"22.5\" cy=\"7.6\" r=\"2.3\"/>",
  K: "<rect x=\"10\" y=\"36\" width=\"25\" height=\"4.5\" rx=\"2\"/><path d=\"M13.2 36 10.8 21.5C9.5 14.8 17 14.4 22.5 19.6 28 14.4 35.5 14.8 34.2 21.5L31.8 36Z\"/><path d=\"M22.5 4.5v13M18 9.5h9\" class=\"cross\"/>",
}

const OUTLINE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}
const SOLID: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }

type PieceProps = {
  color: 'w' | 'b'
  /** chess.js piece type: p, n, b, r, q or k (any case). */
  type: string
  style?: PieceStyle
  /** Forces text (not emoji) glyphs on phones. */
  textPresentation?: boolean
}

/** One chess piece in any of the available styles. Sized by the parent's font-size. */
export function Piece({ color, type, style = 'classic', textPresentation = false }: PieceProps) {
  const kind = type.toUpperCase()
  const className = `chess-piece ps-${style} ${color === 'w' ? 'white-piece' : 'black-piece'}`
  if (style === 'geometric') {
    return (
      <span className={className} aria-hidden="true">
        <svg viewBox="0 0 45 45" dangerouslySetInnerHTML={{ __html: PIECE_SHAPES[kind] ?? '' }} />
      </span>
    )
  }
  if (style === 'letter') return <span className={className} aria-hidden="true"><b>{kind}</b></span>
  const glyph = style === 'classic' ? OUTLINE[`${color}${kind}`] : SOLID[kind]
  return <span className={className}>{glyph}{textPresentation ? '\uFE0E' : ''}</span>
}

type DragGhostProps = PieceProps & { x: number; y: number; size: number }

/** The piece that follows the pointer while dragging. Portaled to <body> so no ancestor transform can offset it. */
export function DragGhost({ x, y, size, ...piece }: DragGhostProps) {
  return createPortal(
    <span className="drag-ghost" style={{ left: x, top: y, width: size, height: size, fontSize: size * 0.75 }}>
      <Piece {...piece} />
    </span>,
    document.body,
  )
}
