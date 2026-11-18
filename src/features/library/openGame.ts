import { fromPgn } from '../analysis/gameModel'
import { setPendingGame } from '../review/pendingGame'
import type { SavedGame } from './libraryModel'

export type OpenTarget = 'review' | 'analysis'

/**
 * Hands a saved game to Game Review or Analysis Studio through the pending-game slot. Review gets the
 * saved id, so an existing review is restored instead of running the engine again.
 * Returns false when the stored PGN can no longer be parsed (nothing is handed over then).
 */
export function openSavedGame(game: Pick<SavedGame, 'id' | 'pgn'>, target: OpenTarget): boolean {
  const state = fromPgn(game.pgn)
  if (!state) return false
  setPendingGame({ ...state, cursor: target === 'analysis' ? state.moves.length : 0 }, target === 'review' ? game.id : null)
  return true
}
