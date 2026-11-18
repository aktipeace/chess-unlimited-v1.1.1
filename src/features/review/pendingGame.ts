import type { GameState } from '../analysis/gameModel'

/**
 * Hand-off slot between pages ("Review this game", "Open in Analysis", Library, Opening Explorer).
 * It is read with `peek` while rendering (safe under React StrictMode, which runs initializers
 * twice) and cleared in an effect once the receiving page has mounted.
 *
 * `savedId` names a Library game, so Game Review can restore its saved review instead of
 * running the engine again.
 */
let pending: GameState | null = null
let pendingSavedId: string | null = null

export function setPendingGame(state: GameState, savedId: string | null = null) {
  pending = state
  pendingSavedId = savedId
}

export function peekPendingGame(): GameState | null {
  return pending
}

export function peekPendingSavedId(): string | null {
  return pendingSavedId
}

export function clearPendingGame() {
  pending = null
  pendingSavedId = null
}
