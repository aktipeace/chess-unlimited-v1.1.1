/**
 * Pure view-model helpers for the Dashboard. Everything here is derived from data the app already
 * stores (saved games, training progress, settings); nothing is invented. No React, no storage.
 *
 * Statistics themselves are NOT recomputed here: use `libraryStats()` and `summarize()`.
 */
import { playerSide, type CountMap, type SavedGame } from '../library/libraryModel'
import { MISTAKE_ID_PREFIX, trainingLink } from '../training/trainingItems'
import { LEVEL_LABELS, THEME_LABELS, dayKey, pickNext, type TrainingItem, type TrainingProgress, type TrainingTheme } from '../training/trainingModel'

/* ---------- daily activity ---------- */

export type ActivityDay = {
  /** Local calendar day, "YYYY-MM-DD". */
  key: string
  weekday: string
  dayOfMonth: number
  isToday: boolean
  /** Training exercises solved that day (from the training progress). */
  solved: number
  /** Games added to the Library that day. */
  saved: number
  /** Game reviews completed that day. */
  reviewed: number
  total: number
}

export type ActivitySummary = {
  /** Oldest first, ending today. */
  days: ActivityDay[]
  today: ActivityDay
  activeDays: number
  totals: { solved: number; saved: number; reviewed: number }
  /** Largest daily total; at least 1 so it can be used as a divisor. */
  peak: number
  hasActivity: boolean
}

const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

/** Local noon of the day `offset` days before `now` (noon avoids daylight-saving edge cases). */
function dayAt(now: number, offset: number): Date {
  const base = new Date(now)
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset, 12)
}

/**
 * Activity of the last `count` days (today included), combining the three real sources the app has:
 * exercises solved, games saved and reviews finished.
 */
export function activitySummary(progress: TrainingProgress, games: SavedGame[], now: number, count = 7): ActivitySummary {
  const saved = new Map<string, number>()
  const reviewed = new Map<string, number>()
  for (const game of games) {
    if (game.createdAt > 0) saved.set(dayKey(game.createdAt), (saved.get(dayKey(game.createdAt)) ?? 0) + 1)
    const at = game.review?.reviewedAt ?? 0
    if (at > 0) reviewed.set(dayKey(at), (reviewed.get(dayKey(at)) ?? 0) + 1)
  }

  const todayKey = dayKey(now)
  const days: ActivityDay[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = dayAt(now, offset)
    const key = dayKey(date.getTime())
    const solvedCount = progress.days[key] ?? 0
    const savedCount = saved.get(key) ?? 0
    const reviewedCount = reviewed.get(key) ?? 0
    days.push({
      key,
      weekday: weekdayFormat.format(date),
      dayOfMonth: date.getDate(),
      isToday: key === todayKey,
      solved: solvedCount,
      saved: savedCount,
      reviewed: reviewedCount,
      total: solvedCount + savedCount + reviewedCount,
    })
  }

  const totals = days.reduce((sum, day) => ({ solved: sum.solved + day.solved, saved: sum.saved + day.saved, reviewed: sum.reviewed + day.reviewed }), { solved: 0, saved: 0, reviewed: 0 })
  return {
    days,
    today: days[days.length - 1],
    activeDays: days.filter((day) => day.total > 0).length,
    totals,
    peak: Math.max(1, ...days.map((day) => day.total)),
    hasActivity: days.some((day) => day.total > 0),
  }
}

/* ---------- recent games ---------- */

export type RecentGame = {
  id: string
  title: string
  opening: string | null
  plies: number
  /** PGN result: "1-0", "0-1", "1/2-1/2" or "*". */
  result: string
  /** Your side when the PGN names match your player name, otherwise null. */
  side: 'w' | 'b' | null
  /** Your result; null when your side is unknown or the game has no result. */
  outcome: 'win' | 'draw' | 'loss' | null
  reviewed: boolean
  /** Accuracy per side from the saved review; `yours` only when your side is known. */
  accuracy: { white: number | null; black: number | null; yours: number | null }
  updatedAt: number
}

function outcomeFor(result: string, side: 'w' | 'b' | null): RecentGame['outcome'] {
  if (!side) return null
  if (result === '1/2-1/2') return 'draw'
  if (result === '1-0') return side === 'w' ? 'win' : 'loss'
  if (result === '0-1') return side === 'b' ? 'win' : 'loss'
  return null
}

/** The most recently updated games, newest first, described for display. */
export function recentGames(games: SavedGame[], playerName: string, limit = 5): RecentGame[] {
  return [...games]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(0, limit))
    .map((game) => {
      const side = playerSide(game, playerName)
      const white = game.review?.whiteAccuracy ?? null
      const black = game.review?.blackAccuracy ?? null
      return {
        id: game.id,
        title: game.title,
        opening: game.opening?.name ?? null,
        plies: game.plies,
        result: game.result,
        side,
        outcome: outcomeFor(game.result, side),
        reviewed: Boolean(game.review),
        accuracy: { white, black, yours: side === 'w' ? white : side === 'b' ? black : null },
        updatedAt: game.updatedAt,
      }
    })
}

/* ---------- move quality ---------- */

export type MoveQualityGroup = { key: 'top' | 'solid' | 'slip' | 'error'; label: string; count: number; share: number }

const QUALITY_GROUPS: Array<{ key: MoveQualityGroup['key']; label: string; classes: Array<keyof CountMap> }> = [
  { key: 'top', label: 'Top moves', classes: ['brilliant', 'great', 'best'] },
  { key: 'solid', label: 'Solid moves', classes: ['excellent', 'good', 'book'] },
  { key: 'slip', label: 'Inaccuracies', classes: ['inaccuracy'] },
  { key: 'error', label: 'Mistakes & blunders', classes: ['mistake', 'miss', 'blunder'] },
]

/** Groups the per-classification move counts of `libraryStats().counts` into four readable buckets. */
export function moveQuality(counts: CountMap): { total: number; groups: MoveQualityGroup[] } {
  const raw = QUALITY_GROUPS.map((group) => ({ ...group, count: group.classes.reduce((sum, name) => sum + (counts[name] ?? 0), 0) }))
  const total = raw.reduce((sum, group) => sum + group.count, 0)
  return { total, groups: raw.map(({ key, label, count }) => ({ key, label, count, share: total ? count / total : 0 })) }
}

/* ---------- continue learning ---------- */

export type ContinueEntry = {
  id: 'pending-review' | 'resume-training' | 'next-training' | 'latest-game'
  title: string
  detail: string
  cta: string
  /** Internal route (may carry a query string). Present on entries that are plain links. */
  to?: string
  /** Present on entries that open a saved game through the pending-game hand-off. */
  game?: { id: string; target: 'review' }
}

export type ContinueInput = {
  items: TrainingItem[]
  progress: TrainingProgress
  games: SavedGame[]
  /** True when another page left a game in the hand-off slot that nobody has picked up. */
  hasPendingGame: boolean
  now: number
}

/** "today", "yesterday" or a short date, for text such as "last tried yesterday". */
export function relativeDay(timestamp: number, now: number): string {
  const key = dayKey(timestamp)
  if (key === dayKey(now)) return 'today'
  if (key === dayKey(dayAt(now, 1).getTime())) return 'yesterday'
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(timestamp))
}

function exerciseName(item: TrainingItem): string {
  return item.kind === 'mistake' ? `Your mistake · ${item.title}` : THEME_LABELS[item.theme]
}

/**
 * Shortcuts that continue something the player really has: a game waiting in the hand-off slot, an
 * exercise they started but did not finish (or the next one in line), and their most recent saved game.
 * Nothing is listed unless the matching data exists.
 */
export function continueLearning(input: ContinueInput): ContinueEntry[] {
  const { items, progress, games, hasPendingGame, now } = input
  const entries: ContinueEntry[] = []

  if (hasPendingGame) {
    entries.push({ id: 'pending-review', title: 'Continue game review', detail: 'A game is loaded and waiting in Game Review.', cta: 'Continue review', to: '/review' })
  }

  const known = new Map(items.map((item) => [item.id, item]))
  let lastTried: { item: TrainingItem; failures: number; lastAt: number } | null = null
  for (const [id, attempt] of Object.entries(progress.items)) {
    const item = known.get(id)
    if (!item || attempt.lastAt <= 0) continue
    if (!lastTried || attempt.lastAt > lastTried.lastAt) lastTried = { item, failures: attempt.failures, lastAt: attempt.lastAt }
  }

  if (lastTried && !progress.items[lastTried.item.id]?.solved) {
    const misses = lastTried.failures
    entries.push({
      id: 'resume-training',
      title: `Resume: ${exerciseName(lastTried.item)}`,
      detail: `Last tried ${relativeDay(lastTried.lastAt, now)}${misses > 0 ? ` · ${misses} wrong ${misses === 1 ? 'move' : 'moves'} so far` : ''}. Not solved yet.`,
      cta: 'Resume training',
      to: trainingLink(lastTried.item.id),
    })
  } else {
    const next = pickNext(items, progress)
    if (next) {
      const started = Object.keys(progress.items).length > 0
      const allSolved = items.every((item) => progress.items[item.id]?.solved)
      entries.push({
        id: 'next-training',
        title: allSolved ? `Revisit: ${exerciseName(next)}` : `${started ? 'Next' : 'First'} exercise: ${exerciseName(next)}`,
        detail: allSolved ? 'Every exercise is solved, so this one comes back for practice.' : `Level: ${LEVEL_LABELS[next.level]} · ${items.filter((item) => !progress.items[item.id]?.solved).length} exercises left.`,
        cta: started ? 'Continue training' : 'Start training',
        to: trainingLink(next.id),
      })
    }
  }

  const latest = recentGames(games, '', 1)[0]
  if (latest) {
    entries.push({
      id: 'latest-game',
      title: latest.reviewed ? 'Open your latest game' : 'Review your latest game',
      detail: `${latest.title}${latest.opening ? ` · ${latest.opening}` : ''}${latest.reviewed ? ' · review saved' : ' · not reviewed yet'}`,
      cta: latest.reviewed ? 'Open review' : 'Start review',
      game: { id: latest.id, target: 'review' },
    })
  }

  return entries
}

/* ---------- recommendations ---------- */

export type RecommendationIcon = 'review' | 'library' | 'training' | 'settings' | 'openings' | 'play' | 'analysis'

export type Recommendation = { id: string; title: string; detail: string; to: string; icon: RecommendationIcon }

export type RecommendationInput = {
  items: TrainingItem[]
  progress: TrainingProgress
  games: SavedGame[]
  /** True when the player has set their own name (needed to recognise their side in PGNs). */
  hasPlayerName: boolean
}

const PUZZLE_THEME_ORDER: TrainingTheme[] = ['mate1', 'mate2', 'mate3', 'material']

/**
 * Up to four suggestions, each backed by the player's actual state; static ideas only fill the list
 * when fewer than three data-driven suggestions apply.
 */
export function recommendations(input: RecommendationInput): Recommendation[] {
  const { items, progress, games, hasPlayerName } = input
  const list: Recommendation[] = []

  if (!games.length) {
    list.push({ id: 'first-game', title: 'Review your first game', detail: 'Paste a PGN or play the bot, then review it. Your statistics appear here.', to: '/review', icon: 'review' })
  } else {
    const unreviewed = games.filter((game) => !game.review).length
    if (unreviewed > 0) {
      list.push({ id: 'unreviewed', title: 'Review a saved game', detail: `${unreviewed} saved ${unreviewed === 1 ? 'game has' : 'games have'} no review yet.`, to: '/library', icon: 'library' })
    }
  }

  const unsolvedMistakes = items.filter((item) => item.id.startsWith(MISTAKE_ID_PREFIX) && !progress.items[item.id]?.solved)
  if (unsolvedMistakes.length) {
    list.push({
      id: 'mistakes',
      title: 'Train from your own mistakes',
      detail: `${unsolvedMistakes.length} ${unsolvedMistakes.length === 1 ? 'position' : 'positions'} from your reviewed games ${unsolvedMistakes.length === 1 ? 'is' : 'are'} waiting.`,
      to: trainingLink(unsolvedMistakes[0].id),
      icon: 'training',
    })
  }

  let weakest: { theme: TrainingTheme; solved: number; total: number } | null = null
  for (const theme of PUZZLE_THEME_ORDER) {
    const pool = items.filter((item) => item.theme === theme)
    const solved = pool.filter((item) => progress.items[item.id]?.solved).length
    if (!pool.length || solved === pool.length) continue
    if (!weakest || solved / pool.length < weakest.solved / weakest.total) weakest = { theme, solved, total: pool.length }
  }
  if (weakest) {
    const next = pickNext(items, progress, { theme: weakest.theme })
    if (next) {
      list.push({ id: 'weakest-theme', title: `Practise: ${THEME_LABELS[weakest.theme]}`, detail: `${weakest.solved} of ${weakest.total} solved. This is your least-practised puzzle theme.`, to: trainingLink(next.id), icon: 'training' })
    }
  }

  if (games.length > 0 && !hasPlayerName) {
    list.push({ id: 'set-name', title: 'Tell Chess Unlimited who you are', detail: 'Set your name in Settings to see your own accuracy and win/draw/loss record.', to: '/settings', icon: 'settings' })
  }

  const fillers: Recommendation[] = [
    { id: 'openings', title: 'Explore openings', detail: 'Browse book moves and ideas in the Opening Explorer.', to: '/openings', icon: 'openings' },
    { id: 'play', title: 'Play the engine', detail: 'Start a game against the bot, then review it.', to: '/play', icon: 'play' },
    { id: 'analysis', title: 'Analyse a position', detail: 'Set up any position and see the engine lines.', to: '/analysis', icon: 'analysis' },
  ]
  for (const filler of fillers) {
    if (list.length >= 3) break
    list.push(filler)
  }
  return list.slice(0, 4)
}

/* ---------- greeting ---------- */

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
