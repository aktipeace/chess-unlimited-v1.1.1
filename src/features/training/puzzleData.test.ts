import { describe, expect, it } from 'vitest'
import { PUZZLES } from './puzzleData'
import { isValidItem } from './trainingModel'

describe('bundled puzzle set', () => {
  it('has well-formed, unique puzzles', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(60)
    const ids = new Set<string>()
    const positions = new Set<string>()
    for (const puzzle of PUZZLES) {
      expect(isValidItem(puzzle)).toBe(true)
      expect(ids.has(puzzle.id)).toBe(false)
      ids.add(puzzle.id)
      const key = puzzle.fen.split(' ').slice(0, 2).join(' ')
      expect(positions.has(key)).toBe(false)
      positions.add(key)
    }
  })

  it('gives every mate puzzle exactly 2N-1 plies and covers each theme', () => {
    for (const puzzle of PUZZLES) {
      const match = /^mate(\d)$/.exec(puzzle.theme)
      if (match) expect(puzzle.solution).toHaveLength(Number(match[1]) * 2 - 1)
      else expect(puzzle.solution.length).toBeLessThan(4)
    }
    for (const theme of ['mate1', 'mate2', 'mate3', 'material']) expect(PUZZLES.some((puzzle) => puzzle.theme === theme)).toBe(true)
  })
})
