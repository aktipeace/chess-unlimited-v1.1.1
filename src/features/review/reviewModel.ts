import { Chess, type PieceSymbol } from 'chess.js'
import { START_FEN, type GameState } from '../analysis/gameModel'
import { bookDepth, uciMovesOf } from '../openings/openingModel'

/**
 * Pure maths for Game Review (no React, no engine).
 *
 * All evaluations are stored from WHITE's point of view. Stockfish reports scores from the
 * side to move, so `toWhiteEval` converts them once, at the edge.
 */

/** Centipawn value used for forced mates, large enough to saturate the win% curve. */
export const MATE_CP = 10000

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'

/** Same order and naming as chess.com's Game Review. */
export const CLASSIFICATIONS: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
}

/** Short symbol drawn on the board square of the move (like chess.com's move icons). */
export const CLASSIFICATION_SYMBOLS: Record<Classification, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '✓',
  book: '≡',
  inaccuracy: '?!',
  mistake: '?',
  miss: '✕',
  blunder: '??',
}

/** Colour of each classification (move dots, board badge and the arrow of the move played). */
export const CLASSIFICATION_COLORS: Record<Classification, string> = {
  brilliant: '#26c9c3',
  great: '#6aa2e8',
  best: '#a8e063',
  excellent: '#6fcf97',
  good: '#9aa5b1',
  book: '#c49a6c',
  inaccuracy: '#f0c75a',
  mistake: '#f09a4a',
  miss: '#f27c88',
  blunder: '#ef4f46',
}

/** One-line explanation (Indonesian) shown next to the move in Game Review. */
export const CLASSIFICATION_HINTS: Record<Classification, string> = {
  brilliant: 'Pengorbanan cerdas yang tetap menjadi langkah terbaik — sulit ditemukan.',
  great: 'Langkah kritis: hampir satu-satunya yang menjaga posisi.',
  best: 'Langkah pilihan pertama engine.',
  excellent: 'Hampir sebaik langkah terbaik.',
  good: 'Langkah solid, hanya melepas sedikit peluang.',
  book: 'Langkah teori pembukaan.',
  inaccuracy: 'Kurang akurat — ada langkah yang jelas lebih baik.',
  mistake: 'Kesalahan yang melemahkan posisi.',
  miss: 'Peluang terlewat: lawan baru saja salah, tetapi keunggulan itu tidak dimanfaatkan.',
  blunder: 'Kesalahan besar yang mengubah arah permainan.',
}

/** Classifications that mean "the move played was what the engine wanted" (no better move to show). */
export const GOOD_CLASSIFICATIONS: Classification[] = ['brilliant', 'great', 'best', 'book']

/** Engine result for one position, from White's point of view. */
export type PositionEval = {
  /** Centipawns (mates are mapped to ±MATE_CP). Positive = White is better. */
  cp: number
  /** Moves to mate (positive = White mates, negative = Black mates, 0 = already checkmated), or null. */
  mate: number | null
  /** Engine's preferred move in UCI notation, or null when there is none (game over). */
  best: string | null
  /** Centipawns (White's view) of the engine's SECOND-best move, when it was searched. Used to spot "only moves". */
  second?: number | null
}

export type RawScore = { type: 'cp' | 'mate'; value: number }

export type ParsedInfo = { score: RawScore; pv: string[]; depth: number; multipv: number }

export type MoveReview = {
  ply: number
  san: string
  uci: string
  color: 'w' | 'b'
  classification: Classification
  /** Win-percentage the mover gave up compared with the engine's best move (0-100). */
  winLoss: number
  /** Centipawns lost versus the best move, each side of the comparison clamped to ±1000. */
  cpLoss: number
  /** Accuracy of this single move, 0-100. */
  accuracy: number
  bestUci: string | null
  bestSan: string | null
}

export type SideSummary = {
  accuracy: number | null
  /** Average centipawn loss. */
  acpl: number | null
  counts: Record<Classification, number>
}

export type ReviewResult = {
  moves: MoveReview[]
  /** One evaluation per position: index 0 is the start, index n is after ply n. */
  positions: PositionEval[]
  white: SideSummary
  black: SideSummary
}

/** Win probability (0-100) for the side that is ahead by `cp` centipawns. Lichess' logistic model. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Accuracy (0-100) of a move that lost `winLoss` percentage points of winning chances. */
export function moveAccuracy(winLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669
  return Math.max(0, Math.min(100, raw))
}

/**
 * Maps a win% loss to a label using chess.com's thresholds (expected points lost):
 * up to 2% Excellent, up to 5% Good, up to 10% Inaccuracy, up to 20% Mistake, above that Blunder.
 * The engine's own move, or one that loses nothing measurable, is always "best".
 * Brilliant, Great, Book and Miss need context and are decided in `buildReview`.
 */
export function classifyLoss(winLoss: number, isBest: boolean): Classification {
  if (isBest || winLoss < 0.1) return 'best'
  if (winLoss < 2) return 'excellent'
  if (winLoss < 5) return 'good'
  if (winLoss < 10) return 'inaccuracy'
  if (winLoss < 20) return 'mistake'
  return 'blunder'
}

/** Parses a UCI `info` line. Returns null for lines without an exact score and a PV. */
export function parseInfoScore(line: string): ParsedInfo | null {
  if (!line.startsWith('info ')) return null
  if (/\b(lowerbound|upperbound)\b/.test(line)) return null
  const cp = line.match(/\bscore cp (-?\d+)/)
  const mate = line.match(/\bscore mate (-?\d+)/)
  const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/) ?? []
  if ((!cp && !mate) || !pv.length) return null
  return {
    score: cp ? { type: 'cp', value: Number(cp[1]) } : { type: 'mate', value: Number(mate?.[1]) },
    pv,
    depth: Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0),
    multipv: Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1),
  }
}

/** Converts a side-to-move score into a White-relative evaluation. */
export function toWhiteEval(score: RawScore, turn: 'w' | 'b', best: string | null): PositionEval {
  const sign = turn === 'w' ? 1 : -1
  if (score.type === 'mate') {
    const mate = sign * score.value
    const side = mate < 0 ? -1 : 1
    return { cp: side * (MATE_CP - Math.min(Math.abs(mate), 100)), mate, best }
  }
  return { cp: sign * score.value, mate: null, best }
}

/** Evaluation of a finished game (checkmate or draw); the engine cannot search these. */
export function terminalEval(chess: Chess): PositionEval {
  if (chess.isCheckmate()) return { cp: chess.turn() === 'w' ? -MATE_CP : MATE_CP, mate: 0, best: null }
  return { cp: 0, mate: null, best: null }
}

/**
 * FEN of every position in the line (index 0 = start) plus, for finished positions, the
 * evaluation that does not need the engine.
 */
export function timelineOf(state: GameState): { fens: string[]; terminals: Array<PositionEval | null> } {
  const chess = new Chess(state.startFen)
  const fens = [chess.fen()]
  const terminals: Array<PositionEval | null> = [chess.isGameOver() ? terminalEval(chess) : null]
  for (const move of state.moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion })
    fens.push(chess.fen())
    terminals.push(chess.isGameOver() ? terminalEval(chess) : null)
  }
  return { fens, terminals }
}

const clampCp = (cp: number) => Math.max(-1000, Math.min(1000, cp))

function emptyCounts(): Record<Classification, number> {
  const counts = {} as Record<Classification, number>
  for (const key of CLASSIFICATIONS) counts[key] = 0
  return counts
}

/** Blend of the arithmetic and harmonic mean, so a few blunders weigh more than in a plain average. */
function combineAccuracy(values: number[]): number | null {
  if (!values.length) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const harmonic = values.length / values.reduce((sum, value) => sum + 1 / Math.max(value, 1), 0)
  return (mean + harmonic) / 2
}

function summarize(moves: MoveReview[]): SideSummary {
  const counts = emptyCounts()
  for (const move of moves) counts[move.classification] += 1
  return {
    accuracy: combineAccuracy(moves.map((move) => move.accuracy)),
    acpl: moves.length ? moves.reduce((sum, move) => sum + move.cpLoss, 0) / moves.length : null,
    counts,
  }
}

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Material balance from `color`'s point of view (own pieces minus the opponent's). */
export function materialBalance(chess: Chess, color: 'w' | 'b'): number {
  let total = 0
  for (const row of chess.board()) {
    for (const square of row) {
      if (square) total += (square.color === color ? 1 : -1) * PIECE_VALUE[square.type]
    }
  }
  return total
}

/**
 * True when the move gives up real material (at least a minor piece for a pawn) even after the
 * opponent's best reply and the mover's best recapture — the "sacrifice" part of a Brilliant move.
 */
function isSacrifice(fenBefore: string, move: { from: string; to: string; promotion?: string }, reply: string | null, color: 'w' | 'b'): boolean {
  if (!reply) return false
  try {
    const chess = new Chess(fenBefore)
    const before = materialBalance(chess, color)
    chess.move({ from: move.from, to: move.to, promotion: move.promotion })
    const answer = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply.slice(4) || undefined })
    if (answer.captured) {
      // Let the mover win the piece back with the cheapest attacker, as a static exchange would.
      const recaptures = chess.moves({ verbose: true }).filter((candidate) => candidate.to === answer.to && candidate.captured)
      recaptures.sort((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece])
      if (recaptures[0]) chess.move(recaptures[0].san)
    }
    return materialBalance(chess, color) <= before - 2
  } catch {
    return false
  }
}

/** True when `move` captures on the square the opponent just captured on (a plain recapture). */
function isRecapture(fenBefore: string, move: { from: string; to: string; promotion?: string }, previous: { to: string } | undefined): boolean {
  if (!previous || previous.to !== move.to) return false
  try {
    return Boolean(new Chess(fenBefore).move({ from: move.from, to: move.to, promotion: move.promotion }).captured)
  } catch {
    return false
  }
}

export type BuildReviewOptions = {
  /** Number of opening-book plies; defaults to the Opening Explorer's book. Pass 0 to disable. */
  bookPlies?: number
}

const moverWin = (cp: number, color: 'w' | 'b') => (color === 'w' ? winPercent(cp) : 100 - winPercent(cp))

/** Builds the full review from one evaluation per position (moves.length + 1 of them). */
export function buildReview(state: GameState, positions: PositionEval[], options: BuildReviewOptions = {}): ReviewResult {
  if (positions.length !== state.moves.length + 1) {
    throw new Error(`Expected ${state.moves.length + 1} evaluations, got ${positions.length}.`)
  }
  const { fens } = timelineOf(state)
  const blackFirst = state.startFen.split(' ')[1] === 'b'
  const bookPlies = options.bookPlies ?? (state.startFen === START_FEN ? bookDepth(uciMovesOf(state.moves)) : 0)

  const moves: MoveReview[] = state.moves.map((record, index) => {
    const before = positions[index]
    const after = positions[index + 1]
    const color: 'w' | 'b' = (index + (blackFirst ? 1 : 0)) % 2 === 0 ? 'w' : 'b'
    const uci = `${record.from}${record.to}${record.promotion ?? ''}`
    const isBest = before.best !== null && before.best === uci

    const winBefore = winPercent(before.cp)
    const winAfter = winPercent(after.cp)
    const winLoss = isBest ? 0 : Math.max(0, color === 'w' ? winBefore - winAfter : winAfter - winBefore)
    const moverBefore = color === 'w' ? before.cp : -before.cp
    const moverAfter = color === 'w' ? after.cp : -after.cp
    const cpLoss = isBest ? 0 : Math.max(0, clampCp(moverBefore) - clampCp(moverAfter))

    let bestSan: string | null = null
    if (before.best) {
      try {
        bestSan = new Chess(fens[index]).move({
          from: before.best.slice(0, 2),
          to: before.best.slice(2, 4),
          promotion: before.best.slice(4) || undefined,
        }).san
      } catch {
        bestSan = null
      }
    }

    let classification = classifyLoss(winLoss, isBest)

    if (classification === 'best' || classification === 'excellent') {
      const winBeforeMover = moverWin(before.cp, color)
      const winAfterMover = moverWin(after.cp, color)
      if (classification === 'best' && winLoss <= 2 && winBeforeMover < 85 && winAfterMover >= 40 && isSacrifice(fens[index], record, after.best, color)) {
        classification = 'brilliant'
      } else if (
        winLoss <= 1 &&
        typeof before.second === 'number' &&
        winBeforeMover < 95 &&
        winBeforeMover - moverWin(before.second, color) >= 15 &&
        !isRecapture(fens[index], record, state.moves[index - 1])
      ) {
        classification = 'great'
      }
    }

    if (index < bookPlies && classification !== 'brilliant') classification = 'book'

    return {
      ply: index + 1,
      san: record.san,
      uci,
      color,
      classification,
      winLoss,
      cpLoss,
      accuracy: moveAccuracy(winLoss),
      bestUci: before.best,
      bestSan,
    }
  })

  // A "Miss": the opponent has just slipped, but this move lets the advantage go.
  moves.forEach((move, index) => {
    if (move.classification !== 'inaccuracy' && move.classification !== 'mistake') return
    const previous = moves[index - 1]
    if (!previous || previous.winLoss < 10) return
    if (moverWin(positions[index].cp, move.color) < 55) return
    move.classification = 'miss'
  })

  return {
    moves,
    positions,
    white: summarize(moves.filter((move) => move.color === 'w')),
    black: summarize(moves.filter((move) => move.color === 'b')),
  }
}

/** Evaluation text from White's point of view: "+0.62", "-1.30", "M3", "-M2", "1-0" style handled by callers. */
export function formatEval(evaluation: PositionEval | undefined): string {
  if (!evaluation) return '—'
  if (evaluation.mate === 0) return evaluation.cp > 0 ? '1-0' : '0-1'
  if (evaluation.mate !== null) return evaluation.mate > 0 ? `M${evaluation.mate}` : `-M${Math.abs(evaluation.mate)}`
  const pawns = evaluation.cp / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}
