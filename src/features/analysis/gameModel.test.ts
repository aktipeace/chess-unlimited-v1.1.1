import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  START_FEN,
  chessAt,
  fromFen,
  fromPgn,
  gameStatus,
  goTo,
  kingSquare,
  moveRows,
  needsPromotion,
  newGame,
  toPgn,
  tryMove,
  type GameState,
} from './gameModel'

function play(state: GameState, ...moves: Array<[string, string, string?]>): GameState {
  let current = state
  for (const [from, to, promotion] of moves) {
    const next = tryMove(current, from as never, to as never, promotion)
    if (!next) throw new Error(`illegal move ${from}${to}`)
    current = next
  }
  return current
}

describe('gameModel — moves and navigation', () => {
  it('starts from the standard position', () => {
    const state = newGame()
    expect(state.moves).toHaveLength(0)
    expect(chessAt(state).fen()).toBe(START_FEN)
  })

  it('records moves and keeps the history (PLY count)', () => {
    const state = play(newGame(), ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'])
    expect(state.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(state.cursor).toBe(3)
    expect(chessAt(state).history()).toHaveLength(3)
  })

  it('rejects illegal moves', () => {
    expect(tryMove(newGame(), 'e2', 'e5')).toBeNull()
  })

  it('steps back and forward without losing the line', () => {
    const full = play(newGame(), ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'])
    const back = goTo(full, 1)
    expect(back.moves).toHaveLength(3)
    expect(chessAt(back).history()).toHaveLength(1)
    expect(goTo(back, 99).cursor).toBe(3)
    expect(goTo(back, -5).cursor).toBe(0)
  })

  it('replaces the continuation when a move is played mid-line', () => {
    const full = play(newGame(), ['e2', 'e4'], ['e7', 'e5'])
    const branched = play(goTo(full, 1), ['c7', 'c5'])
    expect(branched.moves.map((move) => move.san)).toEqual(['e4', 'c5'])
    expect(branched.cursor).toBe(2)
  })
})

describe('gameModel — promotion', () => {
  const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'

  it('detects when a move needs a promotion piece', () => {
    const chess = new Chess(fen)
    expect(needsPromotion(chess, 'a7', 'a8')).toBe(true)
    expect(needsPromotion(new Chess(), 'e2', 'e4')).toBe(false)
  })

  it('plays the chosen promotion piece', () => {
    const state = fromFen(fen)
    expect(state).not.toBeNull()
    const next = tryMove(state as GameState, 'a7', 'a8', 'n')
    expect(next?.moves[0].san.startsWith('a8=N')).toBe(true)
  })
})

describe('gameModel — FEN and PGN', () => {
  it('loads a valid FEN and rejects garbage', () => {
    expect(fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')).not.toBeNull()
    expect(fromFen('not a fen')).toBeNull()
    expect(fromFen('   ')).toBeNull()
  })

  it('round-trips a PGN', () => {
    const state = play(newGame(), ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'])
    const pgn = toPgn(state)
    expect(pgn).toContain('1. e4 e5 2. Nf3')
    const loaded = fromPgn(pgn)
    expect(loaded?.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(loaded?.cursor).toBe(0)
  })

  it('exports the full line even when the cursor is not at the end', () => {
    const state = goTo(play(newGame(), ['e2', 'e4'], ['e7', 'e5']), 1)
    expect(toPgn(state)).toContain('1. e4 e5')
  })

  it('imports a PGN with headers and rejects invalid text', () => {
    const pgn = '[Event "Test"]\n[White "A"]\n[Black "B"]\n\n1. d4 d5 2. c4 e6 *'
    expect(fromPgn(pgn)?.moves).toHaveLength(4)
    expect(fromPgn('this is not a pgn')).toBeNull()
    expect(fromPgn('')).toBeNull()
  })
})

describe('gameModel — status', () => {
  it('reports checkmate (fool\'s mate) with the winner', () => {
    const state = play(newGame(), ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
    const status = gameStatus(chessAt(state))
    expect(status.over).toBe(true)
    expect(status.result).toBe('0-1')
    expect(status.label).toContain('BLACK WINS')
  })

  it('reports stalemate', () => {
    const status = gameStatus(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))
    expect(status.over).toBe(true)
    expect(status.result).toBe('1/2-1/2')
    expect(status.label).toContain('STALEMATE')
  })

  it('reports insufficient material', () => {
    const status = gameStatus(new Chess('k7/8/8/8/8/8/8/K7 w - - 0 1'))
    expect(status.over).toBe(true)
    expect(status.label).toContain('INSUFFICIENT')
  })

  it('reports a plain check and the normal state', () => {
    const check = gameStatus(new Chess('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1'))
    expect(check).toMatchObject({ over: false, check: true, label: 'CHECK' })
    expect(gameStatus(new Chess())).toMatchObject({ over: false, check: false })
  })

  it('finds the king square', () => {
    expect(kingSquare(new Chess(), 'w')).toBe('e1')
    expect(kingSquare(new Chess(), 'b')).toBe('e8')
  })
})

describe('gameModel — move rows', () => {
  it('groups plies into numbered rows', () => {
    const rows = moveRows(play(newGame(), ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ number: 1, white: { san: 'e4', ply: 1 }, black: { san: 'e5', ply: 2 } })
    expect(rows[1]).toMatchObject({ number: 2, white: { san: 'Nf3', ply: 3 } })
    expect(rows[1].black).toBeUndefined()
  })

  it('handles a start position where Black moves first', () => {
    const state = fromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1') as GameState
    const rows = moveRows(play(state, ['e7', 'e5'], ['g1', 'f3']))
    expect(rows[0]).toMatchObject({ number: 1, black: { san: 'e5', ply: 1 } })
    expect(rows[0].white).toBeUndefined()
    expect(rows[1]).toMatchObject({ number: 2, white: { san: 'Nf3', ply: 2 } })
  })
})
