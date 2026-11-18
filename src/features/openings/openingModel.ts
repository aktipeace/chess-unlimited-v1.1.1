import { OPENING_BOOK, type OpeningEntry } from './openingData'

/**
 * Pure opening-book logic (no React, no chess.js). Lines are stored as UCI sequences from the
 * standard start position, so detection is a plain prefix comparison.
 */

export type OpeningMatch = {
  eco: string
  name: string
  /** Number of plies of the matched book line. */
  plies: number
}

export type BookContinuation = {
  uci: string
  san: string
  /** How many book lines continue with this move. */
  lines: number
  /** Names of lines that END exactly after this move (most specific names first). */
  named: Array<{ eco: string; name: string }>
  /** A line through this move, for a short preview when nothing ends exactly here. */
  example: { eco: string; name: string }
}

type Indexed = OpeningEntry & { moves: string[]; sanMoves: string[] }

const INDEX: Indexed[] = OPENING_BOOK.map((entry) => ({ ...entry, moves: entry.uci.split(' '), sanMoves: entry.san.split(' ') }))
const BY_LINE = new Map<string, Indexed>(INDEX.map((entry) => [entry.uci, entry]))

export const BOOK_SIZE = INDEX.length

export function uciMovesOf(moves: Array<{ from: string; to: string; promotion?: string }>): string[] {
  return moves.map((move) => `${move.from}${move.to}${move.promotion ?? ''}`)
}

/** Longest book line that is a prefix of `uci` (the played moves). Null when even 1.xx is not in the book. */
export function detectOpening(uci: string[]): OpeningMatch | null {
  for (let length = uci.length; length >= 1; length -= 1) {
    const entry = BY_LINE.get(uci.slice(0, length).join(' '))
    if (entry) return { eco: entry.eco, name: entry.name, plies: length }
  }
  return null
}

/** Exact name(s) of the position reached by `uci`, when that position is the END of a book line. */
export function openingAt(uci: string[]): OpeningMatch | null {
  const entry = BY_LINE.get(uci.join(' '))
  return entry ? { eco: entry.eco, name: entry.name, plies: uci.length } : null
}

/** Number of leading plies of `uci` that still lie on some book line. */
export function bookDepth(uci: string[]): number {
  let depth = 0
  for (let length = 1; length <= uci.length; length += 1) {
    const prefix = uci.slice(0, length).join(' ')
    if (INDEX.some((entry) => entry.uci === prefix || entry.uci.startsWith(`${prefix} `))) depth = length
    else break
  }
  return depth
}

/** SAN of the moves on the book path `uci`, or null when `uci` leaves the book. */
export function sanPath(uci: string[]): string[] | null {
  if (!uci.length) return []
  const prefix = uci.join(' ')
  const entry = INDEX.find((item) => item.uci === prefix || item.uci.startsWith(`${prefix} `))
  return entry ? entry.sanMoves.slice(0, uci.length) : null
}

/** All moves the book offers after the moves `prefix`, with the openings they lead to. */
export function nextBookMoves(prefix: string[]): BookContinuation[] {
  const head = prefix.join(' ')
  const groups = new Map<string, Indexed[]>()
  for (const entry of INDEX) {
    if (entry.moves.length <= prefix.length) continue
    if (head && !entry.uci.startsWith(`${head} `)) continue
    const next = entry.moves[prefix.length]
    const list = groups.get(next) ?? []
    list.push(entry)
    groups.set(next, list)
  }
  const result: BookContinuation[] = []
  for (const [uci, entries] of groups) {
    const ending = entries.filter((entry) => entry.moves.length === prefix.length + 1)
    const sorted = [...entries].sort((a, b) => a.moves.length - b.moves.length || a.name.localeCompare(b.name))
    result.push({
      uci,
      san: entries[0].sanMoves[prefix.length],
      lines: entries.length,
      named: ending.map((entry) => ({ eco: entry.eco, name: entry.name })),
      example: { eco: sorted[0].eco, name: sorted[0].name },
    })
  }
  // Moves with more book lines first (the most explored ideas), then alphabetically for stability.
  return result.sort((a, b) => b.lines - a.lines || a.san.localeCompare(b.san))
}

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Search by name or ECO code (accent-insensitive: "grunfeld" finds "Grünfeld"). */
export function searchOpenings(query: string, limit = 30): OpeningEntry[] {
  const needle = fold(query).trim()
  if (!needle) return []
  const scored: Array<{ entry: OpeningEntry; score: number }> = []
  for (const entry of OPENING_BOOK) {
    const name = fold(entry.name)
    const eco = entry.eco.toLowerCase()
    let score = -1
    if (eco === needle) score = 0
    else if (name === needle) score = 1
    else if (name.startsWith(needle)) score = 2
    else if (name.includes(needle)) score = 3
    else if (eco.startsWith(needle)) score = 4
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => a.score - b.score || a.entry.san.split(' ').length - b.entry.san.split(' ').length || a.entry.name.localeCompare(b.entry.name))
  return scored.slice(0, limit).map((item) => item.entry)
}

export function entryFor(uci: string[]): OpeningEntry | null {
  return BY_LINE.get(uci.join(' ')) ?? null
}

/** Numbered text of a SAN list: ["e4","e5","Nf3"] -> "1. e4 e5 2. Nf3". */
export function formatLine(san: string[]): string {
  const parts: string[] = []
  san.forEach((move, index) => {
    if (index % 2 === 0) parts.push(`${index / 2 + 1}.`)
    parts.push(move)
  })
  return parts.join(' ')
}
