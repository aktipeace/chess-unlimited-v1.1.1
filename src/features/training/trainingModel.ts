/**
 * Pure model of the Training Center: puzzle items, progress, streaks, move judging and picking
 * the next item. No React, no chess.js, no storage.
 */

export type TrainingTheme = 'mate1' | 'mate2' | 'mate3' | 'material' | 'mistake'

export type TrainingItem = {
  id: string
  kind: 'puzzle' | 'mistake'
  theme: TrainingTheme
  /** Position with the SOLVER to move. */
  fen: string
  /** UCI moves alternating solver, opponent reply, solver, ... and always ending on a solver move. */
  solution: string[]
  title: string
  /** 1 = easy, 2 = medium, 3 = hard. */
  level: 1 | 2 | 3
  note?: string
}

export const THEME_LABELS: Record<TrainingTheme, string> = {
  mate1: 'Skakmat 1 langkah',
  mate2: 'Skakmat 2 langkah',
  mate3: 'Skakmat 3 langkah',
  material: 'Menangkan materi',
  mistake: 'Kesalahanmu',
}

export const LEVEL_LABELS: Record<1 | 2 | 3, string> = { 1: 'Mudah', 2: 'Sedang', 3: 'Sulit' }

export function levelFor(theme: TrainingTheme, solverMoves: number): 1 | 2 | 3 {
  if (theme === 'mate1') return 1
  if (theme === 'mate3') return 3
  if (theme === 'mate2') return 2
  if (theme === 'material') return solverMoves >= 2 ? 3 : 2
  return 2
}

export type Attempt = {
  /** Number of moves tried (wrong or right). */
  tries: number
  failures: number
  solved: boolean
  /** Solved without any wrong move, hint or revealed answer. */
  clean: boolean
  lastAt: number
  solvedAt?: number
}

export type TrainingProgress = {
  version: 1
  items: Record<string, Attempt>
  /** Number of items solved per local day ("YYYY-MM-DD"). */
  days: Record<string, number>
}

export const emptyProgress = (): TrainingProgress => ({ version: 1, items: {}, days: {} })

const pad = (value: number) => String(value).padStart(2, '0')

/** Local calendar day of a timestamp, "YYYY-MM-DD". */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function previousDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return dayKey(new Date(year, month - 1, day - 1, 12).getTime())
}

/** A wrong move on an item. */
export function recordFailure(progress: TrainingProgress, id: string, now: number): TrainingProgress {
  const previous = progress.items[id]
  const next: Attempt = {
    tries: (previous?.tries ?? 0) + 1,
    failures: (previous?.failures ?? 0) + 1,
    solved: previous?.solved ?? false,
    clean: false,
    lastAt: now,
    ...(previous?.solvedAt !== undefined ? { solvedAt: previous.solvedAt } : {}),
  }
  return { ...progress, items: { ...progress.items, [id]: next } }
}

/**
 * Marks an item solved. `assisted` (hint or revealed answer, or an earlier wrong move in this
 * session) means it does not count as a clean solve. Solving the same item again on the same day
 * does not inflate the daily count.
 */
export function recordSolved(progress: TrainingProgress, id: string, assisted: boolean, now: number): TrainingProgress {
  const previous = progress.items[id]
  const day = dayKey(now)
  const alreadyToday = previous?.solved === true && previous.solvedAt !== undefined && dayKey(previous.solvedAt) === day
  const next: Attempt = {
    tries: (previous?.tries ?? 0) + 1,
    failures: previous?.failures ?? 0,
    solved: true,
    clean: !assisted && (previous?.failures ?? 0) === 0,
    lastAt: now,
    solvedAt: now,
  }
  return {
    ...progress,
    items: { ...progress.items, [id]: next },
    days: alreadyToday ? progress.days : { ...progress.days, [day]: (progress.days[day] ?? 0) + 1 },
  }
}

/** Consecutive days with at least one solved item, ending today (or yesterday if today has none yet). */
export function currentStreak(progress: TrainingProgress, now: number): number {
  let cursor = dayKey(now)
  if (!(progress.days[cursor] > 0)) cursor = previousDay(cursor)
  let streak = 0
  while (progress.days[cursor] > 0) {
    streak += 1
    cursor = previousDay(cursor)
  }
  return streak
}

export type TrainingSummary = {
  solved: number
  total: number
  cleanRate: number | null
  streak: number
  today: number
  byTheme: Record<TrainingTheme, { solved: number; total: number }>
}

export function summarize(items: TrainingItem[], progress: TrainingProgress, now: number): TrainingSummary {
  const byTheme = {
    mate1: { solved: 0, total: 0 },
    mate2: { solved: 0, total: 0 },
    mate3: { solved: 0, total: 0 },
    material: { solved: 0, total: 0 },
    mistake: { solved: 0, total: 0 },
  } as TrainingSummary['byTheme']
  let solved = 0
  let clean = 0
  for (const item of items) {
    const attempt = progress.items[item.id]
    byTheme[item.theme].total += 1
    if (attempt?.solved) {
      solved += 1
      byTheme[item.theme].solved += 1
      if (attempt.clean) clean += 1
    }
  }
  return {
    solved,
    total: items.length,
    cleanRate: solved ? clean / solved : null,
    streak: currentStreak(progress, now),
    today: progress.days[dayKey(now)] ?? 0,
    byTheme,
  }
}

/**
 * Next item to practise: unsolved first (easy before hard, then list order); when everything is
 * solved, the ones that were hardest (most failures), then the least recently solved.
 */
export function pickNext(items: TrainingItem[], progress: TrainingProgress, options: { theme?: TrainingTheme | 'all'; excludeId?: string | null } = {}): TrainingItem | null {
  const pool = items.filter((item) => (!options.theme || options.theme === 'all' || item.theme === options.theme) && item.id !== options.excludeId)
  if (!pool.length) return options.excludeId ? items.find((item) => item.id === options.excludeId && (!options.theme || options.theme === 'all' || item.theme === options.theme)) ?? null : null
  const unsolved = pool.filter((item) => !progress.items[item.id]?.solved)
  if (unsolved.length) return [...unsolved].sort((a, b) => a.level - b.level)[0]
  return [...pool].sort((a, b) => {
    const failuresA = progress.items[a.id]?.failures ?? 0
    const failuresB = progress.items[b.id]?.failures ?? 0
    if (failuresA !== failuresB) return failuresB - failuresA
    return (progress.items[a.id]?.solvedAt ?? 0) - (progress.items[b.id]?.solvedAt ?? 0)
  })[0]
}

export type MoveJudgement = {
  correct: boolean
  /** True when this correct move completes the puzzle. */
  done: boolean
  /** The opponent's reply to play automatically after a correct, non-final move. */
  reply: string | null
}

/**
 * Judges the solver's move number `step` (0 = first). The expected move is always accepted; on the
 * final move of a mating puzzle any checkmating move is accepted too (`givesMate`, computed by the caller).
 */
export function judgeMove(item: Pick<TrainingItem, 'solution' | 'theme'>, step: number, uci: string, options: { givesMate?: boolean } = {}): MoveJudgement {
  const index = step * 2
  const expected = item.solution[index]
  if (expected === undefined) return { correct: false, done: false, reply: null }
  const isLast = index === item.solution.length - 1
  const mateTheme = item.theme === 'mate1' || item.theme === 'mate2' || item.theme === 'mate3'
  const correct = uci === expected || (isLast && mateTheme && options.givesMate === true)
  if (!correct) return { correct: false, done: false, reply: null }
  return { correct: true, done: isLast, reply: isLast ? null : item.solution[index + 1] ?? null }
}

/* ---------- validation ---------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback)

export function sanitizeProgress(raw: unknown): TrainingProgress {
  const source = isRecord(raw) ? raw : {}
  const items: Record<string, Attempt> = {}
  if (isRecord(source.items)) {
    for (const [id, value] of Object.entries(source.items)) {
      if (!isRecord(value) || id.length > 60) continue
      const solvedAt = typeof value.solvedAt === 'number' && Number.isFinite(value.solvedAt) ? value.solvedAt : undefined
      items[id] = {
        tries: Math.round(num(value.tries)),
        failures: Math.round(num(value.failures)),
        solved: value.solved === true,
        clean: value.clean === true,
        lastAt: num(value.lastAt),
        ...(solvedAt !== undefined ? { solvedAt } : {}),
      }
    }
  }
  const days: Record<string, number> = {}
  if (isRecord(source.days)) {
    for (const [key, value] of Object.entries(source.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof value === 'number' && value > 0) days[key] = Math.round(value)
    }
  }
  return { version: 1, items, days }
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const FEN = /^[1-8pnbrqkPNBRQK/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/

/** True when an item is structurally usable (valid FEN, odd-length UCI solution). */
export function isValidItem(item: TrainingItem): boolean {
  return FEN.test(item.fen) && item.solution.length % 2 === 1 && item.solution.every((move) => UCI.test(move))
}
