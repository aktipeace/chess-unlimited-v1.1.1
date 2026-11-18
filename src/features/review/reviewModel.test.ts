import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { newGame, tryMove, type GameState } from '../analysis/gameModel'
import {
  CLASSIFICATIONS,
  MATE_CP,
  buildReview,
  materialBalance,
  classifyLoss,
  formatEval,
  moveAccuracy,
  parseInfoScore,
  terminalEval,
  timelineOf,
  toWhiteEval,
  winPercent,
  type PositionEval,
} from './reviewModel'

function play(...moves: Array<[string, string]>): GameState {
  let state = newGame()
  for (const [from, to] of moves) {
    const next = tryMove(state, from as never, to as never)
    if (!next) throw new Error(`illegal ${from}${to}`)
    state = next
  }
  return state
}

describe('reviewModel — win% and accuracy', () => {
  it('is 50% when equal and symmetric around it', () => {
    expect(winPercent(0)).toBeCloseTo(50, 5)
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100, 5)
  })

  it('grows with the advantage and saturates', () => {
    expect(winPercent(100)).toBeCloseTo(59.1, 0)
    expect(winPercent(1000)).toBeGreaterThan(97)
    expect(winPercent(1000)).toBeLessThan(98)
    expect(winPercent(MATE_CP)).toBeGreaterThan(99.9)
  })

  it('gives ~100 accuracy to a perfect move and 0 to a huge loss', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 1)
    expect(moveAccuracy(10)).toBeCloseTo(63.6, 0)
    expect(moveAccuracy(100)).toBe(0)
    expect(moveAccuracy(-5)).toBeCloseTo(100, 1)
  })
})

describe('reviewModel — classification', () => {
  it('maps win% loss to labels', () => {
    // chess.com thresholds: 2 / 5 / 10 / 20 expected-points (win%) lost
    expect(classifyLoss(0.05, false)).toBe('best')
    expect(classifyLoss(0.5, false)).toBe('excellent')
    expect(classifyLoss(1.9, false)).toBe('excellent')
    expect(classifyLoss(3, false)).toBe('good')
    expect(classifyLoss(7, false)).toBe('inaccuracy')
    expect(classifyLoss(12, false)).toBe('mistake')
    expect(classifyLoss(19.9, false)).toBe('mistake')
    expect(classifyLoss(20, false)).toBe('blunder')
  })

  it('always labels the engine move as best', () => {
    expect(classifyLoss(50, true)).toBe('best')
  })
})

describe('reviewModel — UCI parsing', () => {
  it('parses centipawn and mate scores with their PV', () => {
    const cp = parseInfoScore('info depth 12 seldepth 18 multipv 1 score cp 34 nodes 1000 nps 1 pv e2e4 e7e5 g1f3')
    expect(cp).toEqual({ score: { type: 'cp', value: 34 }, pv: ['e2e4', 'e7e5', 'g1f3'], depth: 12, multipv: 1 })
    const mate = parseInfoScore('info depth 20 multipv 1 score mate -3 pv a1a2')
    expect(mate?.score).toEqual({ type: 'mate', value: -3 })
  })

  it('ignores bound lines, lines without a PV and non-info output', () => {
    expect(parseInfoScore('info depth 5 score cp 10 lowerbound pv e2e4')).toBeNull()
    expect(parseInfoScore('info depth 1 score cp 3')).toBeNull()
    expect(parseInfoScore('bestmove e2e4')).toBeNull()
    expect(parseInfoScore('info string NNUE evaluation using nn.nnue')).toBeNull()
  })

  it('converts side-to-move scores to White\'s point of view', () => {
    expect(toWhiteEval({ type: 'cp', value: 50 }, 'w', 'e2e4')).toEqual({ cp: 50, mate: null, best: 'e2e4' })
    expect(toWhiteEval({ type: 'cp', value: 50 }, 'b', null).cp).toBe(-50)
    const whiteMate = toWhiteEval({ type: 'mate', value: 3 }, 'w', null)
    expect(whiteMate.mate).toBe(3)
    expect(whiteMate.cp).toBe(MATE_CP - 3)
    const blackMate = toWhiteEval({ type: 'mate', value: 2 }, 'b', null)
    expect(blackMate.mate).toBe(-2)
    expect(blackMate.cp).toBe(-(MATE_CP - 2))
  })
})

describe('reviewModel — finished positions and timeline', () => {
  it('evaluates checkmate and stalemate without the engine', () => {
    const mated = new Chess()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) mated.move(san)
    expect(terminalEval(mated)).toEqual({ cp: -MATE_CP, mate: 0, best: null })
    expect(terminalEval(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({ cp: 0, mate: null, best: null })
  })

  it('lists one FEN per position and marks only the final one as terminal', () => {
    const state = play(['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
    const { fens, terminals } = timelineOf(state)
    expect(fens).toHaveLength(5)
    expect(terminals.slice(0, 4).every((entry) => entry === null)).toBe(true)
    expect(terminals[4]?.mate).toBe(0)
  })
})

describe('reviewModel — buildReview', () => {
  // 1. e4 e5 2. Nf3, with hand-made evaluations (White's point of view).
  const state = play(['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'])
  const positions: PositionEval[] = [
    { cp: 20, mate: null, best: 'e2e4' },
    { cp: 20, mate: null, best: 'c7c5' },
    { cp: 160, mate: null, best: 'g1f3' },
    { cp: 150, mate: null, best: 'b8c6' },
  ]

  it('classifies moves, finds the better move and computes losses', () => {
    const review = buildReview(state, positions, { bookPlies: 0 })
    expect(review.moves).toHaveLength(3)

    expect(review.moves[0]).toMatchObject({ san: 'e4', color: 'w', classification: 'best', winLoss: 0 })

    const black = review.moves[1]
    expect(black.color).toBe('b')
    expect(black.classification).toBe('mistake')
    expect(black.winLoss).toBeCloseTo(12.5, 0)
    expect(black.cpLoss).toBe(140)
    expect(black.bestUci).toBe('c7c5')
    expect(black.bestSan).toBe('c5')

    expect(review.moves[2]).toMatchObject({ san: 'Nf3', classification: 'best' })
  })

  it('summarizes each side', () => {
    const review = buildReview(state, positions, { bookPlies: 0 })
    expect(review.white.counts.best).toBe(2)
    expect(review.white.accuracy).toBeGreaterThan(99.9)
    expect(review.white.acpl).toBe(0)
    expect(review.black.counts.mistake).toBe(1)
    expect(review.black.accuracy).toBeGreaterThan(55)
    expect(review.black.accuracy).toBeLessThan(58)
    expect(review.black.acpl).toBe(140)
  })

  it('rejects a wrong number of evaluations', () => {
    expect(() => buildReview(state, positions.slice(1))).toThrow()
  })

  it('has no accuracy for a side that has not moved', () => {
    const one = play(['e2', 'e4'])
    const review = buildReview(one, positions.slice(0, 2), { bookPlies: 0 })
    expect(review.black.accuracy).toBeNull()
    expect(review.black.acpl).toBeNull()
  })
})

describe('reviewModel — formatEval', () => {
  it('formats pawns, mates and results from White\'s point of view', () => {
    expect(formatEval(undefined)).toBe('—')
    expect(formatEval({ cp: 62, mate: null, best: null })).toBe('+0.62')
    expect(formatEval({ cp: -130, mate: null, best: null })).toBe('-1.30')
    expect(formatEval({ cp: MATE_CP - 3, mate: 3, best: null })).toBe('M3')
    expect(formatEval({ cp: -(MATE_CP - 2), mate: -2, best: null })).toBe('-M2')
    expect(formatEval({ cp: -MATE_CP, mate: 0, best: null })).toBe('0-1')
  })
})

describe('reviewModel — chess.com style classes', () => {
  const eval0 = (cp: number, best: string | null, second?: number): PositionEval => ({ cp, mate: null, best, ...(second === undefined ? {} : { second }) })

  it('lists the ten chess.com classes', () => {
    expect(CLASSIFICATIONS).toEqual(['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'])
  })

  it('labels opening-book moves as Book', () => {
    const state = play(['e2', 'e4'], ['e7', 'e5'])
    const review = buildReview(state, [eval0(20, 'e2e4'), eval0(20, 'e7e5'), eval0(20, 'g1f3')], { bookPlies: 2 })
    expect(review.moves.map((move) => move.classification)).toEqual(['book', 'book'])
    expect(review.white.counts.book).toBe(1)
  })

  it('labels the only good move as Great', () => {
    // After 1.e4 e5 the best move is Nf3 and every alternative loses a lot.
    const state = play(['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'])
    const positions = [eval0(20, 'e2e4'), eval0(20, 'e7e5'), eval0(60, 'g1f3', -300), eval0(60, 'b8c6')]
    const review = buildReview(state, positions, { bookPlies: 0 })
    expect(review.moves[2].classification).toBe('great')
    expect(review.moves[0].classification).toBe('best') // no second-best info => stays Best
  })

  it('does not call a recapture Great', () => {
    const state = play(['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5'])
    const positions = [eval0(20, 'e2e4'), eval0(20, 'd7d5'), eval0(30, 'e4d5'), eval0(30, 'd8d5', -400), eval0(30, 'b1c3')]
    const review = buildReview(state, positions, { bookPlies: 0 })
    expect(review.moves[3].classification).toBe('best') // Qxd5 recaptures on the square just captured
  })

  it('flags a Miss: the opponent blundered and the advantage was not used', () => {
    // 1.e4 e5?? (Black loses ~34% of its chances) 2.a3 (White keeps a lot, but gives ~9% back)
    const state = play(['e2', 'e4'], ['e7', 'e5'], ['a2', 'a3'])
    const positions = [eval0(20, 'e2e4'), eval0(20, 'c7c5'), eval0(500, 'g1f3'), eval0(330, 'b8c6')]
    const review = buildReview(state, positions, { bookPlies: 0 })
    expect(review.moves[1].classification).toBe('blunder')
    expect(review.moves[2].classification).toBe('miss')
  })

  it('counts material from one side', () => {
    expect(materialBalance(new Chess(), 'w')).toBe(0)
    expect(materialBalance(new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1'), 'w')).toBe(-1)
  })

  it('awards Brilliant to a best-move sacrifice that is not already winning', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Bxf7+!? Kxf7: the bishop is given up for a pawn.
    const state = play(['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['c4', 'f7'])
    const bests = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'c4f7', 'e8f7']
    const review = buildReview(state, bests.map((best) => eval0(20, best)), { bookPlies: 0 })
    expect(review.moves[6].classification).toBe('brilliant')
    expect(review.moves.slice(0, 6).every((move) => move.classification === 'best')).toBe(true)
  })

  it('does not award Brilliant when the side is already completely winning', () => {
    const state = play(['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['c4', 'f7'])
    const bests = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'c4f7', 'e8f7']
    const evals = bests.map((best, index) => eval0(index === 6 ? 900 : 20, best))
    expect(buildReview(state, evals, { bookPlies: 0 }).moves[6].classification).toBe('best')
  })
})
