import { describe, expect, it } from 'vitest'
import { makeSavedGame, reviewToStored } from '../library/libraryModel'
import { mistakeItems } from './trainingItems'
import { isValidItem } from './trainingModel'

const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const result = {
  moves: [{ ply: 3, san: 'Qh5', uci: 'd1h5', color: 'w', classification: 'blunder', winLoss: 18.26, cpLoss: 300, accuracy: 5, bestUci: 'g1f3', bestSan: 'Nf3' }],
  positions: [{ cp: 0, mate: null, best: 'e2e4' }, { cp: 0, mate: null, best: 'e7e5' }, { cp: 0, mate: null, best: 'g1f3' }, { cp: -300, mate: null, best: 'g8f6' }],
  white: { accuracy: 50, acpl: 100, counts: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 } },
  black: { accuracy: 90, acpl: 5, counts: { best: 2, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 } },
} as never

describe('mistake training items', () => {
  const game = { ...makeSavedGame({ id: 'g1', pgn: '[White "Hafidz"]\n[Black "Rani"]\n\n1. e4 e5 2. Qh5 *', plies: 3, now: 1 }), review: reviewToStored(result, 14, ['x', 'y', FEN], 1) }

  it('turns saved mistakes into valid items that solve with the engine move', () => {
    const items = mistakeItems([game], 'Hafidz')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'm-g1-3', theme: 'mistake', solution: ['g1f3'], level: 2 })
    expect(items[0].note).toContain('Qh5')
    expect(isValidItem(items[0])).toBe(true)
  })

  it("skips the opponent's mistakes when the player is recognised", () => {
    expect(mistakeItems([game], 'Rani')).toHaveLength(0)
  })

  it('returns nothing for games without a review', () => {
    expect(mistakeItems([makeSavedGame({ id: 'g2', pgn: '1. e4 *', plies: 1, now: 1 })], 'Hafidz')).toEqual([])
  })
})
