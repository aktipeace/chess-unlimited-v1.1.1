import { describe, expect, it } from 'vitest'
import type { ReviewResult } from '../review/reviewModel'
import {
  attachReview,
  gameKey,
  libraryStats,
  makeSavedGame,
  parsePgnHeaders,
  playerSide,
  removeGame,
  renameGame,
  reviewToStored,
  sanitizeLibrary,
  searchGames,
  splitPgnGames,
  storedToPositions,
  trainingMistakes,
  upsertGame,
  type SavedGame,
} from './libraryModel'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const PGN_ONE = '[Event "Liga Kampus"]\n[Site "Tasikmalaya"]\n[Date "2026.11.14"]\n[White "Hafidz"]\n[Black "Rani"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0'
const PGN_TWO = '[Event "Blitz"]\n[White "Dina"]\n[Black "Hafidz"]\n[Result "0-1"]\n\n1. d4 d5 0-1'

const moves = (...uci: string[]) => uci.map((item) => ({ from: item.slice(0, 2), to: item.slice(2, 4), promotion: item[4], san: item }))
const counts = (patch: Partial<Record<string, number>> = {}) => ({ brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, ...patch }) as never

function fakeReview(plies = 3): ReviewResult {
  return {
    moves: Array.from({ length: plies }, (_, index) => ({
      ply: index + 1,
      san: ['e4', 'e5', 'Qh5'][index] ?? 'x',
      uci: 'a1a1',
      color: index % 2 === 0 ? 'w' : 'b',
      classification: index === 2 ? 'blunder' : 'best',
      winLoss: index === 2 ? 22.34 : 0,
      cpLoss: 0,
      accuracy: 90,
      bestUci: 'g1f3',
      bestSan: 'Nf3',
    })) as ReviewResult['moves'],
    positions: Array.from({ length: plies + 1 }, (_, index) => ({ cp: 20 * index, mate: null, best: 'g1f3' })),
    white: { accuracy: 81.234, acpl: 30.5, counts: counts({ best: 1, blunder: 1 }) },
    black: { accuracy: 92.0, acpl: 10, counts: counts({ best: 1 }) },
  }
}

const FENS = [START, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2']

describe('library model — ids and headers', () => {
  it('derives the same id for the same game and a different id otherwise', () => {
    const a = { startFen: START, moves: moves('e2e4', 'e7e5') }
    const b = { startFen: START, moves: moves('e2e4', 'e7e5') }
    const c = { startFen: START, moves: moves('e2e4', 'c7c5') }
    expect(gameKey(a)).toBe(gameKey(b))
    expect(gameKey(a)).not.toBe(gameKey(c))
    expect(gameKey(a)).toMatch(/^g[0-9a-f]{16}$/)
  })

  it('reads PGN header tags', () => {
    expect(parsePgnHeaders(PGN_ONE)).toMatchObject({ Event: 'Liga Kampus', White: 'Hafidz', Black: 'Rani', Result: '1-0' })
  })

  it('splits a multi-game PGN and leaves a single game alone', () => {
    expect(splitPgnGames(`${PGN_ONE}\n\n\n${PGN_TWO}`)).toHaveLength(2)
    expect(splitPgnGames(PGN_ONE)).toHaveLength(1)
    expect(splitPgnGames('  ')).toEqual([])
    expect(splitPgnGames('1. e4 e5 2. Nf3')).toEqual(['1. e4 e5 2. Nf3'])
  })

  it('builds a saved game with a readable title and cleaned headers', () => {
    const game = makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1000 })
    expect(game.title).toBe('Hafidz vs Rani')
    expect(game.result).toBe('1-0')
    expect(game.date).toBe('2026.11.14')
    const unnamed = makeSavedGame({ id: 'g2', pgn: '[White "?"]\n[Black "?"]\n\n1. e4 *', plies: 1, now: 1 })
    expect(unnamed.title).toBe('Permainan tanpa nama')
    expect(makeSavedGame({ id: 'g3', pgn: PGN_ONE, plies: 3, now: 1, title: '  Final kampus ' }).title).toBe('Final kampus')
  })
})

describe('library model — collection operations', () => {
  const base = makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 100 })

  it('upsert keeps createdAt and an existing review when the new copy has none', () => {
    const reviewed = attachReview([base], 'g1', reviewToStored(fakeReview(), 14, FENS, 150))
    const again = upsertGame(reviewed, { ...base, updatedAt: 500 })
    expect(again).toHaveLength(1)
    expect(again[0].createdAt).toBe(100)
    expect(again[0].updatedAt).toBe(500)
    expect(again[0].review?.depth).toBe(14)
  })

  it('keeps a title the user typed when the game is saved again', () => {
    const renamed = renameGame([base], 'g1', 'Final kampus')
    expect(upsertGame(renamed, { ...base, updatedAt: 9 })[0].title).toBe('Final kampus')
  })

  it('sorts newest first and enforces the cap', () => {
    const games: SavedGame[] = []
    let list = games
    for (let index = 0; index < 5; index += 1) list = upsertGame(list, makeSavedGame({ id: `g${index}`, pgn: PGN_ONE, plies: 3, now: index }), 3)
    expect(list.map((game) => game.id)).toEqual(['g4', 'g3', 'g2'])
  })

  it('removes, renames (ignoring empty titles) and searches', () => {
    const second = makeSavedGame({ id: 'g2', pgn: PGN_TWO, plies: 2, now: 200, opening: { eco: 'D00', name: "Queen's Pawn Game" } })
    const list = [base, second]
    expect(removeGame(list, 'g1').map((game) => game.id)).toEqual(['g2'])
    expect(renameGame(list, 'g1', '   ')).toBe(list)
    expect(searchGames(list, 'rani').map((game) => game.id)).toEqual(['g1'])
    expect(searchGames(list, 'd00').map((game) => game.id)).toEqual(['g2'])
    expect(searchGames(list, '')).toHaveLength(2)
  })
})

describe('library model — stored reviews', () => {
  it('compresses a review and restores the positions', () => {
    const stored = reviewToStored(fakeReview(), 14, FENS, 777)
    expect(stored.whiteAccuracy).toBe(81.2)
    expect(stored.positions).toHaveLength(4)
    expect(storedToPositions(stored)[2]).toEqual({ cp: 40, mate: null, best: 'g1f3' })
  })

  it('keeps the mistakes with the position before the move, worst first', () => {
    const stored = reviewToStored(fakeReview(), 14, FENS, 1)
    expect(stored.mistakes).toHaveLength(1)
    expect(stored.mistakes[0]).toMatchObject({ ply: 3, classification: 'blunder', best: 'g1f3', winLoss: 22.3 })
    expect(stored.mistakes[0].fen).toBe(FENS[2])
  })

  it('drops a stored review whose length does not match its game', () => {
    const game = { ...makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 }), review: reviewToStored(fakeReview(), 14, FENS, 1) }
    const broken = { ...game, id: 'g2', plies: 10 }
    const clean = sanitizeLibrary({ version: 1, games: [game, broken] })
    expect(clean.games).toHaveLength(2)
    expect(clean.games.find((item) => item.plies === 3)?.review).toBeDefined()
    expect(clean.games.find((item) => item.plies === 10)?.review).toBeUndefined()
  })

  it('survives garbage and removes duplicates and invalid entries', () => {
    expect(sanitizeLibrary(null).games).toEqual([])
    expect(sanitizeLibrary({ games: 'nope' }).games).toEqual([])
    const good = makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 })
    const result = sanitizeLibrary({ games: [good, good, { id: '', pgn: 'x' }, 42, { id: 'g9', pgn: '' }] })
    expect(result.games.map((game) => game.id)).toEqual(['g1'])
  })

  it('rejects malformed mistakes while keeping the review', () => {
    const stored = reviewToStored(fakeReview(), 14, FENS, 1)
    const game = {
      ...makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 }),
      review: { ...stored, mistakes: [...stored.mistakes, { ...stored.mistakes[0], best: 'zzzz' }, { ...stored.mistakes[0], fen: 'not a fen' }] },
    }
    expect(sanitizeLibrary({ games: [game] }).games[0].review?.mistakes).toHaveLength(1)
  })
})

describe('library model — statistics', () => {
  it('recognises the player side from the PGN names', () => {
    expect(playerSide({ white: 'Hafidz', black: 'Rani' }, 'hafidz')).toBe('w')
    expect(playerSide({ white: 'Dina', black: 'Hafidz Ramadhan' }, 'Hafidz')).toBe('b')
    expect(playerSide({ white: 'Dina', black: 'Rani' }, 'Hafidz')).toBeNull()
    expect(playerSide({ white: 'Hafidz', black: 'Hafidz' }, 'Hafidz')).toBeNull()
    expect(playerSide({ white: 'A', black: 'B' }, 'A')).toBeNull()
  })

  it('averages the player accuracy and counts the record', () => {
    const one = { ...makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 }), review: reviewToStored(fakeReview(), 14, FENS, 1) }
    const two = makeSavedGame({ id: 'g2', pgn: PGN_TWO, plies: 2, now: 2 })
    const stats = libraryStats([one, two], 'Hafidz')
    expect(stats.total).toBe(2)
    expect(stats.reviewed).toBe(1)
    expect(stats.accuracyScope).toBe('player')
    expect(stats.averageAccuracy).toBeCloseTo(81.2, 1)
    expect(stats.record).toEqual({ wins: 2, draws: 0, losses: 0 })
    expect(stats.counts.blunder).toBe(1)
  })

  it('falls back to both sides when the player is not recognised', () => {
    const one = { ...makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 }), review: reviewToStored(fakeReview(), 14, FENS, 1) }
    const stats = libraryStats([one], 'Someone Else')
    expect(stats.accuracyScope).toBe('all')
    expect(stats.averageAccuracy).toBeCloseTo((81.2 + 92) / 2, 1)
  })

  it('reports no accuracy when nothing is reviewed', () => {
    const stats = libraryStats([makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 })], 'Hafidz')
    expect(stats.accuracyScope).toBe('none')
    expect(stats.averageAccuracy).toBeNull()
  })

  it("trains on the player's own mistakes only when the side is known", () => {
    const one = { ...makeSavedGame({ id: 'g1', pgn: PGN_ONE, plies: 3, now: 1 }), review: reviewToStored(fakeReview(), 14, FENS, 1) }
    expect(trainingMistakes([one], 'Hafidz')).toHaveLength(1) // White (Hafidz) played the blunder on ply 3
    expect(trainingMistakes([one], 'Rani')).toHaveLength(0)
    expect(trainingMistakes([one], 'Nobody')).toHaveLength(1)
  })
})
