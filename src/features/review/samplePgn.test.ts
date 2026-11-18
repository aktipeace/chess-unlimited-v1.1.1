import { describe, expect, it } from 'vitest'
import { fromPgn } from '../analysis/gameModel'
import { SAMPLE_PGN } from './samplePgn'

describe('sample PGN', () => {
  it('is a valid 33-ply game that ends in checkmate', () => {
    const state = fromPgn(SAMPLE_PGN)
    expect(state).not.toBeNull()
    expect(state?.moves).toHaveLength(33)
    expect(state?.moves[32].san).toBe('Rd8#')
  })
})
