/**
 * Pure model for the "Play vs Bot" practice opponent (no React, no worker).
 *
 * The bot is a Stockfish that is deliberately limited the way a club player is: it searches
 * shallowly, looks at a handful of candidate moves and picks among them with a rating-dependent
 * amount of noise, now and then slipping to a clearly weaker move. Strength is a practice
 * setting inside this app — the opponent is always announced as a bot.
 */

export type BotCandidate = {
  /** UCI move, e.g. "e2e4" or "e7e8q". */
  move: string
  /** Centipawns from the point of view of the side to move. Mates are mapped to ±10000. */
  cp: number
}

export type BotParams = {
  rating: number
  depth: number
  multiPv: number
  /** Softmax temperature in centipawns: higher = more random choices. */
  temperature: number
  /** Chance of deliberately playing a weaker candidate (an oversight). */
  slipChance: number
  /** How far (cp) below the best move a slip may fall. */
  slipWindow: number
}

export const MIN_BOT_RATING = 600
export const MAX_BOT_RATING = 2600

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

export function botParams(rating: number): BotParams {
  const r = clamp(Math.round(rating), MIN_BOT_RATING, MAX_BOT_RATING)
  const t = (r - MIN_BOT_RATING) / (MAX_BOT_RATING - MIN_BOT_RATING)
  return {
    rating: r,
    depth: Math.round(lerp(2, 16, Math.pow(t, 0.9))),
    multiPv: Math.round(lerp(5, 3, t)),
    temperature: lerp(180, 12, Math.pow(t, 0.8)),
    slipChance: lerp(0.14, 0.004, Math.pow(t, 0.7)),
    slipWindow: lerp(350, 120, t),
  }
}

export function botLevelLabel(rating: number): string {
  if (rating < 900) return 'Pemula'
  if (rating < 1300) return 'Santai'
  if (rating < 1700) return 'Klub'
  if (rating < 2100) return 'Mahir'
  return 'Master'
}

const SOFTMAX_CLIP = 2000

/** Chooses the bot's move among the engine's candidates. `random` returns a number in [0, 1). */
export function pickBotMove(candidates: BotCandidate[], params: BotParams, random: () => number = Math.random): string | null {
  if (!candidates.length) return null
  const sorted = [...candidates].sort((a, b) => b.cp - a.cp)
  const best = sorted[0]
  if (sorted.length === 1) return best.move

  // A forced mate in one is rarely missed, even by beginners.
  if (best.cp >= 9990 && random() > params.slipChance * 2) return best.move

  // An oversight: any candidate that is not too much worse than the best.
  if (random() < params.slipChance) {
    const options = sorted.slice(1).filter((item) => best.cp - item.cp <= params.slipWindow)
    if (options.length) return options[Math.floor(random() * options.length)].move
  }

  const top = clamp(best.cp, -SOFTMAX_CLIP, SOFTMAX_CLIP)
  const weights = sorted.map((item) => Math.exp((clamp(item.cp, -SOFTMAX_CLIP, SOFTMAX_CLIP) - top) / params.temperature))
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0)
  for (let index = 0; index < sorted.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return sorted[index].move
  }
  return best.move
}

export type ThinkContext = {
  /** Plies played so far. */
  ply: number
  /** Number of legal moves in the position. */
  legalMoves: number
  /** Gap in centipawns between the best and second-best candidate (small = a hard choice). */
  spread: number
}

/** How long (ms) the bot "thinks" before moving: quick in the opening, slower in close positions. */
export function thinkTimeMs(context: ThinkContext, random: () => number = Math.random): number {
  if (context.legalMoves <= 1) return Math.round(250 + random() * 250)
  let time = context.ply < 14 ? 450 + random() * 750 : 900 + random() * 1500
  if (context.spread < 40) time += 500 + random() * 1200
  else if (context.spread > 300) time *= 0.6
  return Math.round(time)
}
