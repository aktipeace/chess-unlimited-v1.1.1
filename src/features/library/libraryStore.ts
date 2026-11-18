import { createPersistentStore, usePersistentStore } from '../../lib/persistentStore'
import { STORAGE_PREFIX } from '../../lib/storage'
import { START_FEN, toPgn, type GameState } from '../analysis/gameModel'
import { detectOpening, uciMovesOf } from '../openings/openingModel'
import type { ReviewResult } from '../review/reviewModel'
import {
  attachReview,
  emptyLibrary,
  gameKey,
  makeSavedGame,
  removeGame,
  renameGame,
  reviewToStored,
  sanitizeLibrary,
  upsertGame,
  type Library,
  type SavedGame,
} from './libraryModel'

export const LIBRARY_KEY = `${STORAGE_PREFIX}library:v1`

export const libraryStore = createPersistentStore<Library>({
  key: LIBRARY_KEY,
  fallback: emptyLibrary,
  sanitize: sanitizeLibrary,
})

export function useLibrary(): Library {
  return usePersistentStore(libraryStore)
}

export type SaveOutcome = { id: string; ok: boolean; created: boolean }

export type SaveReviewInput = { result: ReviewResult; depth: number; fens: string[] }

/**
 * Saves (or updates) a game in the Library. The id is derived from the moves, so saving the same
 * game again updates it instead of creating a duplicate; an existing review is kept unless a new one is given.
 */
export function saveGameToLibrary(state: GameState, options: { review?: SaveReviewInput; title?: string } = {}): SaveOutcome {
  const now = Date.now()
  const id = gameKey(state)
  const created = !libraryStore.get().games.some((game) => game.id === id)
  const pgn = toPgn(state)
  const match = state.startFen === START_FEN ? detectOpening(uciMovesOf(state.moves)) : null
  const base = makeSavedGame({
    id,
    pgn,
    plies: state.moves.length,
    now,
    title: options.title,
    opening: match ? { eco: match.eco, name: match.name } : undefined,
  })
  const game: SavedGame = options.review
    ? { ...base, review: reviewToStored(options.review.result, options.review.depth, options.review.fens, now) }
    : base
  const ok = libraryStore.set((library) => ({ version: 1, games: upsertGame(library.games, game) }))
  return { id, ok, created }
}

export function saveReviewToLibrary(id: string, input: SaveReviewInput): boolean {
  return libraryStore.set((library) => ({
    version: 1,
    games: attachReview(library.games, id, reviewToStored(input.result, input.depth, input.fens, Date.now())),
  }))
}

export function deleteGame(id: string): boolean {
  return libraryStore.set((library) => ({ version: 1, games: removeGame(library.games, id) }))
}

export function rename(id: string, title: string): boolean {
  return libraryStore.set((library) => ({ version: 1, games: renameGame(library.games, id, title) }))
}

export function clearLibrary(): boolean {
  return libraryStore.set(emptyLibrary())
}
