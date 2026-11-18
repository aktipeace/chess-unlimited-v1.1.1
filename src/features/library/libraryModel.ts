import type { Classification, PositionEval, ReviewResult } from '../review/reviewModel'

/**
 * Pure model of the local game Library: saved games, their (optional) review, and summaries.
 * No React, no storage, no chess.js — everything here is plain data and can be tested in isolation.
 */

export const MAX_GAMES = 300
export const MAX_MISTAKES_PER_GAME = 12
export const MAX_PGN_LENGTH = 200_000

const CLASS_KEYS: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']

export type CountMap = Record<Classification, number>

export type StoredMistake = {
  ply: number
  color: 'w' | 'b'
  san: string
  /** Position BEFORE the mistake, with the mistaken side to move. */
  fen: string
  /** Engine's preferred move (UCI) in that position. */
  best: string
  bestSan: string | null
  classification: 'mistake' | 'blunder'
  winLoss: number
}

export type StoredReview = {
  depth: number
  reviewedAt: number
  /** One entry per position: [centipawns (White's view), mate-in or null, best move UCI or null]. */
  positions: Array<[number, number | null, string | null] | [number, number | null, string | null, number]>
  whiteAccuracy: number | null
  blackAccuracy: number | null
  whiteAcpl: number | null
  blackAcpl: number | null
  whiteCounts: CountMap
  blackCounts: CountMap
  mistakes: StoredMistake[]
}

export type SavedGame = {
  id: string
  createdAt: number
  updatedAt: number
  title: string
  white: string
  black: string
  result: string
  event: string
  date: string
  plies: number
  pgn: string
  opening?: { eco: string; name: string }
  review?: StoredReview
}

export type Library = { version: 1; games: SavedGame[] }

export const emptyLibrary = (): Library => ({ version: 1, games: [] })

/* ---------- ids and headers ---------- */

/** FNV-1a 32-bit hash as 8 hex characters. Good enough to recognise "the same game". */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Stable id for a game: the same start position and moves always give the same id. */
export function gameKey(state: { startFen: string; moves: ReadonlyArray<{ from: string; to: string; promotion?: string }> }): string {
  const body = state.moves.map((move) => `${move.from}${move.to}${move.promotion ?? ''}`).join(' ')
  return `g${fnv1a(`${state.startFen}|${body}`)}${fnv1a(`${body}|${state.startFen}`)}`
}

export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const pattern = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(pgn))) headers[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  return headers
}

/** Splits a multi-game PGN file into single games (a new game starts at a line beginning "[Event "). */
export function splitPgnGames(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []
  const starts: number[] = []
  const pattern = /^\[Event\s/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(normalized))) starts.push(match.index)
  if (starts.length <= 1) return [normalized]
  const parts: string[] = []
  starts.forEach((start, index) => {
    const part = normalized.slice(start, starts[index + 1] ?? normalized.length).trim()
    if (part) parts.push(part)
  })
  const head = normalized.slice(0, starts[0]).trim()
  if (head && /\d/.test(head) && !head.startsWith('[')) parts.unshift(head)
  return parts
}

const UNKNOWN_NAMES = new Set(['', '?', '-', 'unknown'])

function cleanHeader(value: string | undefined, fallback = ''): string {
  const text = (value ?? '').trim()
  return UNKNOWN_NAMES.has(text.toLowerCase()) ? fallback : text.slice(0, 80)
}

export function titleFor(white: string, black: string, event: string): string {
  if (white && black) return `${white} vs ${black}`
  if (event) return event
  return 'Permainan tanpa nama'
}

export type NewGameInput = {
  id: string
  pgn: string
  plies: number
  now: number
  opening?: { eco: string; name: string }
  /** Optional override, e.g. a custom title typed by the user. */
  title?: string
}

export function makeSavedGame(input: NewGameInput): SavedGame {
  const headers = parsePgnHeaders(input.pgn)
  const white = cleanHeader(headers.White)
  const black = cleanHeader(headers.Black)
  const event = cleanHeader(headers.Event)
  const rawResult = (headers.Result ?? '*').trim()
  const result = ['1-0', '0-1', '1/2-1/2', '*'].includes(rawResult) ? rawResult : '*'
  const date = /^\d{4}\.(\d{2}|\?\?)\.(\d{2}|\?\?)$/.test(headers.Date ?? '') ? (headers.Date as string) : ''
  return {
    id: input.id,
    createdAt: input.now,
    updatedAt: input.now,
    title: (input.title ?? '').trim().slice(0, 80) || titleFor(white, black, event),
    white,
    black,
    result,
    event,
    date,
    plies: Math.max(0, Math.round(input.plies)),
    pgn: input.pgn.slice(0, MAX_PGN_LENGTH),
    ...(input.opening ? { opening: input.opening } : {}),
  }
}

/* ---------- review <-> storage ---------- */

export function reviewToStored(result: ReviewResult, depth: number, fens: string[], now: number): StoredReview {
  const mistakes: StoredMistake[] = []
  for (const move of result.moves) {
    const kind = move.classification === 'blunder' ? 'blunder' : (move.classification === 'mistake' || move.classification === 'miss') && move.winLoss >= 10 ? 'mistake' : null
    if (!kind || !move.bestUci) continue
    const fen = fens[move.ply - 1]
    if (!fen) continue
    mistakes.push({
      ply: move.ply,
      color: move.color,
      san: move.san,
      fen,
      best: move.bestUci,
      bestSan: move.bestSan,
      classification: kind,
      winLoss: Math.round(move.winLoss * 10) / 10,
    })
  }
  mistakes.sort((a, b) => b.winLoss - a.winLoss || a.ply - b.ply)
  const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)
  return {
    depth,
    reviewedAt: now,
    positions: result.positions.map((entry) => (typeof entry.second === 'number' ? [Math.round(entry.cp), entry.mate, entry.best, Math.round(entry.second)] : [Math.round(entry.cp), entry.mate, entry.best])),
    whiteAccuracy: round1(result.white.accuracy),
    blackAccuracy: round1(result.black.accuracy),
    whiteAcpl: round1(result.white.acpl),
    blackAcpl: round1(result.black.acpl),
    whiteCounts: { ...result.white.counts },
    blackCounts: { ...result.black.counts },
    mistakes: mistakes.slice(0, MAX_MISTAKES_PER_GAME),
  }
}

export function storedToPositions(review: StoredReview): PositionEval[] {
  return review.positions.map(([cp, mate, best, second]) => ({ cp, mate, best, ...(typeof second === 'number' ? { second } : {}) }))
}

/* ---------- collection operations ---------- */

/** Inserts or updates a game (same id). Newest first, capped at MAX_GAMES. */
export function upsertGame(games: SavedGame[], game: SavedGame, limit: number = MAX_GAMES): SavedGame[] {
  const existing = games.find((item) => item.id === game.id)
  const merged: SavedGame = existing
    ? {
        ...game,
        createdAt: existing.createdAt,
        updatedAt: game.updatedAt,
        title: existing.title !== titleFromHeaders(existing) ? existing.title : game.title,
        review: game.review ?? existing.review,
        opening: game.opening ?? existing.opening,
      }
    : game
  const rest = games.filter((item) => item.id !== game.id)
  return [merged, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}

function titleFromHeaders(game: SavedGame) {
  return titleFor(game.white, game.black, game.event)
}

export function removeGame(games: SavedGame[], id: string): SavedGame[] {
  return games.filter((game) => game.id !== id)
}

export function renameGame(games: SavedGame[], id: string, title: string): SavedGame[] {
  const clean = title.trim().slice(0, 80)
  if (!clean) return games
  return games.map((game) => (game.id === id ? { ...game, title: clean } : game))
}

export function attachReview(games: SavedGame[], id: string, review: StoredReview): SavedGame[] {
  return games.map((game) => (game.id === id ? { ...game, review, updatedAt: Math.max(game.updatedAt, review.reviewedAt) } : game))
}

/** Case-insensitive search over title, players, event, opening name and ECO code. */
export function searchGames(games: SavedGame[], query: string): SavedGame[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return games
  return games.filter((game) =>
    [game.title, game.white, game.black, game.event, game.opening?.name ?? '', game.opening?.eco ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle),
  )
}

/* ---------- validation of stored data ---------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const numOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '')

function sanitizeCounts(value: unknown): CountMap {
  const source = isRecord(value) ? value : {}
  const counts = {} as CountMap
  for (const key of CLASS_KEYS) counts[key] = Math.max(0, Math.round(num(source[key])))
  return counts
}

const FEN_PATTERN = /^[1-8pnbrqkPNBRQK/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/

function sanitizeReview(value: unknown, plies: number): StoredReview | undefined {
  if (!isRecord(value) || !Array.isArray(value.positions)) return undefined
  if (value.positions.length !== plies + 1) return undefined // a review that does not match its game is useless
  const positions: StoredReview['positions'] = []
  for (const entry of value.positions) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'number' || !Number.isFinite(entry[0])) return undefined
    const best = typeof entry[2] === 'string' && UCI_PATTERN.test(entry[2]) ? entry[2] : null
    if (typeof entry[3] === 'number' && Number.isFinite(entry[3])) positions.push([entry[0], numOrNull(entry[1]), best, entry[3]])
    else positions.push([entry[0], numOrNull(entry[1]), best])
  }
  const mistakes: StoredMistake[] = []
  if (Array.isArray(value.mistakes)) {
    for (const item of value.mistakes) {
      if (!isRecord(item)) continue
      const best = str(item.best, 5)
      const fen = str(item.fen, 100)
      if (!UCI_PATTERN.test(best) || !FEN_PATTERN.test(fen)) continue
      if (item.classification !== 'mistake' && item.classification !== 'blunder') continue
      if (item.color !== 'w' && item.color !== 'b') continue
      mistakes.push({
        ply: Math.max(1, Math.round(num(item.ply, 1))),
        color: item.color,
        san: str(item.san, 12),
        fen,
        best,
        bestSan: typeof item.bestSan === 'string' ? item.bestSan.slice(0, 12) : null,
        classification: item.classification,
        winLoss: num(item.winLoss),
      })
    }
  }
  return {
    depth: Math.max(1, Math.round(num(value.depth, 14))),
    reviewedAt: num(value.reviewedAt),
    positions,
    whiteAccuracy: numOrNull(value.whiteAccuracy),
    blackAccuracy: numOrNull(value.blackAccuracy),
    whiteAcpl: numOrNull(value.whiteAcpl),
    blackAcpl: numOrNull(value.blackAcpl),
    whiteCounts: sanitizeCounts(value.whiteCounts),
    blackCounts: sanitizeCounts(value.blackCounts),
    mistakes: mistakes.slice(0, MAX_MISTAKES_PER_GAME),
  }
}

export function sanitizeGame(value: unknown): SavedGame | null {
  if (!isRecord(value)) return null
  const id = str(value.id, 40)
  const pgn = str(value.pgn, MAX_PGN_LENGTH)
  if (!id || !pgn.trim()) return null
  const plies = Math.max(0, Math.round(num(value.plies)))
  const white = str(value.white, 80)
  const black = str(value.black, 80)
  const event = str(value.event, 80)
  const result = ['1-0', '0-1', '1/2-1/2', '*'].includes(str(value.result, 8)) ? str(value.result, 8) : '*'
  const opening = isRecord(value.opening) && str(value.opening.name, 80) ? { eco: str(value.opening.eco, 4), name: str(value.opening.name, 80) } : undefined
  const review = sanitizeReview(value.review, plies)
  return {
    id,
    createdAt: num(value.createdAt),
    updatedAt: num(value.updatedAt, num(value.createdAt)),
    title: str(value.title, 80) || titleFor(white, black, event),
    white,
    black,
    result,
    event,
    date: str(value.date, 12),
    plies,
    pgn,
    ...(opening ? { opening } : {}),
    ...(review ? { review } : {}),
  }
}

export function sanitizeLibrary(raw: unknown): Library {
  const source = isRecord(raw) ? raw : {}
  const list = Array.isArray(source.games) ? source.games : []
  const seen = new Set<string>()
  const games: SavedGame[] = []
  for (const item of list) {
    const game = sanitizeGame(item)
    if (!game || seen.has(game.id)) continue
    seen.add(game.id)
    games.push(game)
  }
  games.sort((a, b) => b.updatedAt - a.updatedAt)
  return { version: 1, games: games.slice(0, MAX_GAMES) }
}

/* ---------- statistics ---------- */

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Which side is "you" in a saved game, judged by the name in the PGN headers. */
export function playerSide(game: Pick<SavedGame, 'white' | 'black'>, playerName: string): 'w' | 'b' | null {
  const me = normalize(playerName)
  if (me.length < 2) return null
  const matches = (name: string) => {
    const other = normalize(name)
    if (!other) return false
    return other === me || (me.length >= 3 && (other.includes(me) || me.includes(other)) && Math.min(me.length, other.length) >= 3)
  }
  const white = matches(game.white)
  const black = matches(game.black)
  if (white && !black) return 'w'
  if (black && !white) return 'b'
  return null
}

export type LibraryStats = {
  total: number
  reviewed: number
  /** Average accuracy over reviewed games: your side when recognised, otherwise both sides. */
  averageAccuracy: number | null
  accuracyScope: 'player' | 'all' | 'none'
  /** Counts of your (or all) moves by quality across reviewed games. */
  counts: CountMap
  gamesAsPlayer: number
  record: { wins: number; draws: number; losses: number }
}

export function libraryStats(games: SavedGame[], playerName: string): LibraryStats {
  const counts = {} as CountMap
  for (const key of CLASS_KEYS) counts[key] = 0
  const playerAccuracies: number[] = []
  const allAccuracies: number[] = []
  let reviewed = 0
  let gamesAsPlayer = 0
  const record = { wins: 0, draws: 0, losses: 0 }

  for (const game of games) {
    const side = playerSide(game, playerName)
    if (side) {
      gamesAsPlayer += 1
      if (game.result === '1/2-1/2') record.draws += 1
      else if ((game.result === '1-0' && side === 'w') || (game.result === '0-1' && side === 'b')) record.wins += 1
      else if (game.result === '1-0' || game.result === '0-1') record.losses += 1
    }
    const review = game.review
    if (!review) continue
    reviewed += 1
    const sides: Array<'w' | 'b'> = side ? [side] : ['w', 'b']
    for (const current of sides) {
      const accuracy = current === 'w' ? review.whiteAccuracy : review.blackAccuracy
      const sideCounts = current === 'w' ? review.whiteCounts : review.blackCounts
      if (accuracy !== null) (side ? playerAccuracies : allAccuracies).push(accuracy)
      for (const key of CLASS_KEYS) counts[key] += sideCounts[key]
    }
  }

  const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
  const playerAverage = average(playerAccuracies)
  const allAverage = average(allAccuracies)
  return {
    total: games.length,
    reviewed,
    averageAccuracy: playerAverage ?? allAverage,
    accuracyScope: playerAverage !== null ? 'player' : allAverage !== null ? 'all' : 'none',
    counts,
    gamesAsPlayer,
    record,
  }
}

/** Mistakes worth training on: yours when the name matches, otherwise everyone's. */
export function trainingMistakes(games: SavedGame[], playerName: string): Array<StoredMistake & { gameId: string; gameTitle: string }> {
  const items: Array<StoredMistake & { gameId: string; gameTitle: string }> = []
  for (const game of games) {
    if (!game.review) continue
    const side = playerSide(game, playerName)
    for (const mistake of game.review.mistakes) {
      if (side && mistake.color !== side) continue
      items.push({ ...mistake, gameId: game.id, gameTitle: game.title })
    }
  }
  return items
}
