import { Chess, type Square } from 'chess.js'

/**
 * Pure game model for the Analysis Studio (no React).
 *
 * The state keeps the *whole* main line plus a cursor, so the UI can step back and forward
 * without losing moves. Playing a move while the cursor is not at the end replaces the
 * continuation (a new main line). Positions are rebuilt by replaying the moves from
 * `startFen`, which keeps the full history that chess.js needs for threefold repetition.
 */

export type MoveRecord = {
  from: Square
  to: Square
  promotion?: string
  san: string
}

export type GameState = {
  startFen: string
  moves: MoveRecord[]
  /** Number of plies currently shown: 0 = start position, moves.length = end of the line. */
  cursor: number
  /** PGN tag pairs worth keeping (players, event, date, ...). Set when a PGN is imported. */
  headers?: Record<string, string>
}

export type MoveRow = {
  number: number
  white?: { san: string; ply: number }
  black?: { san: string; ply: number }
}

export type GameStatus = {
  over: boolean
  check: boolean
  /** Short uppercase label for the board footer, e.g. "CHECKMATE · BLACK WINS". */
  label: string
  /** PGN-style result for finished games: "1-0", "0-1", "1/2-1/2". */
  result?: '1-0' | '0-1' | '1/2-1/2'
}

export const START_FEN = new Chess().fen()

export function newGame(startFen: string = START_FEN): GameState {
  return { startFen, moves: [], cursor: 0 }
}

/** Replays the line up to the cursor and returns the resulting position (with history). */
export function chessAt(state: GameState, cursor: number = state.cursor): Chess {
  const chess = new Chess(state.startFen)
  const end = Math.max(0, Math.min(cursor, state.moves.length))
  for (let index = 0; index < end; index += 1) {
    const move = state.moves[index]
    chess.move({ from: move.from, to: move.to, promotion: move.promotion })
  }
  return chess
}

export function goTo(state: GameState, cursor: number): GameState {
  const next = Math.max(0, Math.min(cursor, state.moves.length))
  return next === state.cursor ? state : { ...state, cursor: next }
}

/** True when moving `from` -> `to` is a pawn promotion (so the UI must ask for the piece). */
export function needsPromotion(chess: Chess, from: Square, to: Square): boolean {
  return chess.moves({ square: from, verbose: true }).some((move) => move.to === to && Boolean(move.promotion))
}

/**
 * Plays a move at the cursor. Returns the new state, or null when the move is illegal.
 * Any moves after the cursor are dropped.
 */
export function tryMove(state: GameState, from: Square, to: Square, promotion?: string): GameState | null {
  const chess = chessAt(state)
  try {
    const move = chess.move({ from, to, promotion })
    if (!move) return null
    const record: MoveRecord = { from: move.from, to: move.to, promotion: move.promotion, san: move.san }
    const moves = [...state.moves.slice(0, state.cursor), record]
    // A new line has no known result any more, but the players and event stay.
    const headers = state.headers ? { ...state.headers, Result: '*' } : undefined
    return { startFen: state.startFen, moves, cursor: moves.length, ...(headers ? { headers } : {}) }
  } catch {
    return null
  }
}

export function fromFen(fen: string): GameState | null {
  const text = fen.trim()
  if (!text) return null
  try {
    return newGame(new Chess(text).fen())
  } catch {
    return null
  }
}

/** Parses a PGN (headers, comments and move numbers allowed). Starts at ply 0. */
export function fromPgn(pgn: string): GameState | null {
  const text = pgn.trim()
  if (!text) return null
  try {
    const parsed = new Chess()
    parsed.loadPgn(text)
    const history = parsed.history({ verbose: true })
    if (!history.length) return null
    const headers = parsed.header() as Record<string, string | null | undefined>
    const startFen = headers.FEN ? new Chess(headers.FEN).fen() : START_FEN
    const kept: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && value && value !== '?' && key !== 'FEN' && key !== 'SetUp') kept[key] = value
    }
    const state: GameState = {
      startFen,
      moves: history.map((move) => ({ from: move.from, to: move.to, promotion: move.promotion, san: move.san })),
      cursor: 0,
      ...(Object.keys(kept).length ? { headers: kept } : {}),
    }
    chessAt(state, state.moves.length) // throws if the rebuilt line is inconsistent
    return state
  } catch {
    return null
  }
}

/** Exports the full line (not only up to the cursor) as PGN. */
export function toPgn(state: GameState): string {
  const chess = chessAt(state, state.moves.length)
  const tags: Record<string, string> = { Event: 'Chess Unlimited analysis', Site: 'Chess Unlimited', ...(state.headers ?? {}) }
  chess.header(...Object.entries(tags).flat())
  return chess.pgn()
}

export function gameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    const whiteWins = chess.turn() === 'b'
    return {
      over: true,
      check: true,
      label: `CHECKMATE · ${whiteWins ? 'WHITE' : 'BLACK'} WINS`,
      result: whiteWins ? '1-0' : '0-1',
    }
  }
  if (chess.isStalemate()) return { over: true, check: false, label: 'DRAW · STALEMATE', result: '1/2-1/2' }
  if (chess.isInsufficientMaterial()) return { over: true, check: false, label: 'DRAW · INSUFFICIENT MATERIAL', result: '1/2-1/2' }
  if (chess.isThreefoldRepetition()) return { over: true, check: false, label: 'DRAW · REPETITION', result: '1/2-1/2' }
  if (chess.isDraw()) return { over: true, check: false, label: 'DRAW · 50-MOVE RULE', result: '1/2-1/2' }
  if (chess.isCheck()) return { over: false, check: true, label: 'CHECK' }
  return { over: false, check: false, label: 'LOCAL POSITION' }
}

/** Groups the line into numbered rows ("1. e4 e5"), honouring a start position with Black to move. */
export function moveRows(state: GameState): MoveRow[] {
  const parts = state.startFen.split(' ')
  const offset = parts[1] === 'b' ? 1 : 0
  const startNumber = Number(parts[5]) || 1
  const rows: MoveRow[] = []
  state.moves.forEach((move, index) => {
    const moveIndex = index + offset
    const number = startNumber + Math.floor(moveIndex / 2)
    const entry = { san: move.san, ply: index + 1 }
    if (moveIndex % 2 === 0) {
      rows.push({ number, white: entry })
    } else {
      const last = rows[rows.length - 1]
      if (last && last.number === number && !last.black) last.black = entry
      else rows.push({ number, black: entry })
    }
  })
  return rows
}

/** Square of the king of `color`, used to highlight a check. */
export function kingSquare(chess: Chess, color: 'w' | 'b'): Square | null {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square
    }
  }
  return null
}
