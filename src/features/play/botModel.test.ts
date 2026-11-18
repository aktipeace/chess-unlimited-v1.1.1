import { describe, expect, it } from 'vitest'
import { MAX_BOT_RATING, MIN_BOT_RATING, botLevelLabel, botParams, pickBotMove, thinkTimeMs, type BotCandidate } from './botModel'

// Small deterministic generator so the statistics below are repeatable.
function seeded(seed = 7) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return value / 2147483647
  }
}

const CANDIDATES: BotCandidate[] = [
  { move: 'e2e4', cp: 40 },
  { move: 'd2d4', cp: 30 },
  { move: 'g1f3', cp: 20 },
  { move: 'a2a3', cp: -150 },
  { move: 'h2h4', cp: -400 },
]

function share(rating: number, move: string, runs = 3000) {
  const random = seeded()
  const params = botParams(rating)
  let hits = 0
  for (let index = 0; index < runs; index += 1) if (pickBotMove(CANDIDATES, params, random) === move) hits += 1
  return hits / runs
}

describe('botParams', () => {
  it('gets stronger as the rating rises', () => {
    const weak = botParams(MIN_BOT_RATING)
    const strong = botParams(MAX_BOT_RATING)
    expect(strong.depth).toBeGreaterThan(weak.depth)
    expect(strong.temperature).toBeLessThan(weak.temperature)
    expect(strong.slipChance).toBeLessThan(weak.slipChance)
  })

  it('clamps ratings outside the supported range', () => {
    expect(botParams(100).rating).toBe(MIN_BOT_RATING)
    expect(botParams(9999).rating).toBe(MAX_BOT_RATING)
  })

  it('labels levels', () => {
    expect(botLevelLabel(700)).toBe('Pemula')
    expect(botLevelLabel(1500)).toBe('Klub')
    expect(botLevelLabel(2400)).toBe('Master')
  })
})

describe('pickBotMove', () => {
  it('returns null without candidates and the only move when there is one', () => {
    expect(pickBotMove([], botParams(1200))).toBeNull()
    expect(pickBotMove([{ move: 'e2e4', cp: 0 }], botParams(1200))).toBe('e2e4')
  })

  it('plays a mate in one', () => {
    expect(pickBotMove([{ move: 'd1h5', cp: 10000 }, { move: 'e2e4', cp: 50 }], botParams(800), seeded())).toBe('d1h5')
  })

  it('a weak bot errs more often than a strong one', () => {
    expect(share(600, 'a2a3')).toBeGreaterThan(share(2000, 'a2a3'))
    expect(share(2600, 'e2e4')).toBeGreaterThan(share(600, 'e2e4'))
  })

  it('only ever returns one of the candidates', () => {
    const random = seeded(3)
    const moves = new Set(CANDIDATES.map((item) => item.move))
    for (let index = 0; index < 200; index += 1) expect(moves.has(pickBotMove(CANDIDATES, botParams(1000), random) ?? '')).toBe(true)
  })
})

describe('thinkTimeMs', () => {
  it('moves quickly when there is only one legal move', () => {
    expect(thinkTimeMs({ ply: 30, legalMoves: 1, spread: 0 }, seeded())).toBeLessThan(600)
  })

  it('takes longer in close middlegame positions than in the opening', () => {
    const opening = thinkTimeMs({ ply: 4, legalMoves: 20, spread: 100 }, () => 0.5)
    const hard = thinkTimeMs({ ply: 30, legalMoves: 30, spread: 10 }, () => 0.5)
    expect(hard).toBeGreaterThan(opening)
  })
})
