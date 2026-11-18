import { trainingMistakes, type SavedGame } from '../library/libraryModel'
import { PUZZLES } from './puzzleData'
import { isValidItem, type TrainingItem } from './trainingModel'

/**
 * "Train from your own mistakes": every mistake or blunder saved by Game Review becomes an item.
 * The position is the one BEFORE the mistake and the solution is the engine's best move there.
 */
export function mistakeItems(games: SavedGame[], playerName: string): TrainingItem[] {
  return trainingMistakes(games, playerName).map((mistake) => ({
    id: `m-${mistake.gameId}-${mistake.ply}`,
    kind: 'mistake',
    theme: 'mistake',
    fen: mistake.fen,
    solution: [mistake.best],
    title: mistake.gameTitle,
    level: mistake.classification === 'blunder' ? 2 : 1,
    note: `Pada langkah ${mistake.ply} kamu bermain ${mistake.san} (${mistake.classification === 'blunder' ? 'blunder' : 'mistake'}, −${mistake.winLoss.toFixed(1)}% peluang menang). Temukan langkah yang dipilih engine.`,
  }))
}

/** Prefix of every item id that comes from the player's own games (see `mistakeItems`). */
export const MISTAKE_ID_PREFIX = 'm-'

export type TrainingPool = { puzzles: TrainingItem[]; mistakes: TrainingItem[]; all: TrainingItem[] }

/**
 * Every exercise the Training Center can show: the bundled puzzles plus the player's own mistakes,
 * keeping only structurally valid items. The Dashboard and the Training Center both count from this
 * pool, so their totals always agree.
 */
export function trainingPool(games: SavedGame[], playerName: string): TrainingPool {
  const puzzles = PUZZLES.filter(isValidItem)
  const mistakes = mistakeItems(games, playerName).filter(isValidItem)
  return { puzzles, mistakes, all: [...puzzles, ...mistakes] }
}

/** Query-string value for the Training Center's `?item=` deep link. */
export function trainingLink(itemId: string): string {
  return `/training?item=${encodeURIComponent(itemId)}`
}
