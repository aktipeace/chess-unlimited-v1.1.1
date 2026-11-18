// Generates CANDIDATE tactical puzzles by sampling engine-vs-engine games that start from the opening book,
// then keeping positions where Stockfish finds a unique forced mate (mate in 1-3) or a unique move that wins material.
// Usage: node scripts/gen-puzzles.mjs --seed 1 --games 40 --out /tmp/p1.json
// Candidates are re-verified at a higher depth by scripts/merge-puzzles.mjs before they ship.
import { writeFileSync } from 'node:fs'
import { Engine } from './lib/engine.mjs'
import { OPENINGS } from './data/openings.source.mjs'
import { START_FEN, applyMove, isCheckmate, legalMoves, moveFromUci, parseFen, playSan, toFen, uciOf, inCheck } from './lib/minichess.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, value, index, list) => (value.startsWith('--') ? [...acc, [value.slice(2), list[index + 1]]] : acc), []))
const seed = Number(args.seed ?? 1)
const games = Number(args.games ?? 30)
const out = args.out ?? `/tmp/puzzles-${seed}.json`
const SEARCH_DEPTH = Number(args.depth ?? 12)
const ONLY = args.only ?? 'all' // 'mate' skips material puzzles (used to top up mate-in-2/3)

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(seed * 7919 + 13)
const pick = (list) => list[Math.floor(rand() * list.length)]

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 }
function material(pos, color) {
  let total = 0
  for (const row of pos.board) for (const piece of row) {
    if (!piece || piece.toLowerCase() === 'k') continue
    const isWhite = piece === piece.toUpperCase()
    if ((color === 'w') === isWhite) total += VALUE[piece.toLowerCase()]
  }
  return total
}
const net = (pos, color) => material(pos, color) - material(pos, color === 'w' ? 'b' : 'w')
const pieceCount = (pos) => pos.board.flat().filter(Boolean).length

const engine = await new Engine({ hash: 64, threads: 1 }).init()
const found = []
const seenKeys = new Set()
const stats = { positions: 0, mate: 0, material: 0 }

function scoreOf(line) {
  // Score from the side to move; mates mapped to big numbers.
  if (line.mate !== null) return line.mate > 0 ? 100000 - line.mate : -100000 - line.mate
  return line.cp
}

/** Returns a puzzle for `fen` (solver = side to move) or null. */
async function tryPuzzle(fen) {
  const res = await engine.search(fen, SEARCH_DEPTH, 2)
  const top = res.lines[0]
  const second = res.lines[1] ?? null
  if (!top) return null
  const solver = fen.split(' ')[1]

  // --- Mate in 1..3: unique shortest mate.
  if (top.mate !== null && top.mate > 0 && top.mate <= 3) {
    const secondMate = second && second.mate !== null && second.mate > 0 ? second.mate : null
    const secondWins = second && second.mate === null && second.cp >= 600
    if (secondMate !== null && secondMate <= top.mate) return null // another equally fast mate
    if (secondWins && top.mate >= 2) return null // too many ways to win
    // Build the line from the PV (solver, opponent, solver, ...), ending on the mating move.
    const length = top.mate * 2 - 1
    const pv = top.pv.slice(0, length)
    if (pv.length !== length) return null
    return { fen, solution: pv, theme: `mate${top.mate}`, mate: top.mate, gap: second ? Math.min(scoreOf(top) - scoreOf(second), 5000) : 5000 }
  }

  // --- Win material: one clearly best move, big advantage, material actually gained along the PV.
  if (ONLY !== 'mate' && top.mate === null && top.cp >= 250 && top.cp <= 2000 && second && second.mate === null && top.cp - second.cp >= 200 && second.cp < 150) {
    let pos = parseFen(fen)
    const before = net(pos, solver)
    const pv = top.pv.slice(0, 4)
    // Material after each (solver, opponent) pair.
    const settled = []
    for (let i = 0; i < pv.length; i += 1) {
      const move = moveFromUci(pos, pv[i])
      if (!move) return null
      pos = applyMove(pos, move)
      if (i % 2 === 1) settled.push(net(pos, solver))
    }
    // Shortest prefix of 1 or 2 solver moves after which the solver is >= 2 points up and stays up.
    for (let pairs = 1; pairs <= Math.min(2, settled.length); pairs += 1) {
      if (settled[pairs - 1] - before >= 2) {
        const solution = pv.slice(0, pairs * 2 - 1) // end on a solver move
        return { fen, solution, theme: 'material', mate: null, gap: top.cp - second.cp, gain: settled[pairs - 1] - before }
      }
    }
  }
  return null
}

async function samplePlayMove(fen) {
  const res = await engine.search(fen, 6, 4)
  if (!res.lines.length) return null
  const legal = legalMoves(parseFen(fen))
  if (!legal.length) return null
  const roll = rand()
  if (roll < 0.22) return { uci: uciOf(pick(legal)), injected: true } // injected inaccuracy to create tactical chances
  const best = scoreOf(res.lines[0])
  const options = res.lines.filter((line) => scoreOf(line) >= best - 120).map((line) => line.pv[0])
  if (roll < 0.62 || options.length === 1) return { uci: options[0], injected: false }
  return { uci: pick(options), injected: false }
}

for (let game = 0; game < games; game += 1) {
  const entry = pick(OPENINGS.filter((row) => row[2].split(' ').length >= 3))
  let pos
  try {
    pos = playSan(entry[2].split(' ')).pos
  } catch {
    continue
  }
  await engine.newGame()
  let ply = entry[2].split(' ').length
  let lastInjected = false
  while (ply < 70) {
    const fen = toFen(pos)
    if (legalMoves(pos).length === 0) break
    if (ply >= 12 && pieceCount(pos) >= 8 && (lastInjected || ply % 4 === 0)) {
      stats.positions += 1
      const puzzle = await tryPuzzle(fen)
      if (puzzle) {
        const key = fen.split(' ').slice(0, 2).join(' ')
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          found.push({ ...puzzle, from: entry[1] })
          stats[puzzle.theme === 'material' ? 'material' : 'mate'] += 1
          // A solved tactic usually ends the interesting part of the game; start a fresh one.
          break
        }
      }
    }
    const choice = await samplePlayMove(fen)
    if (!choice) break
    lastInjected = choice.injected
    const move = moveFromUci(pos, choice.uci)
    if (!move) break
    pos = applyMove(pos, move)
    ply += 1
  }
  if (game % 5 === 4) {
    writeFileSync(out, JSON.stringify(found))
    console.error(`[seed ${seed}] game ${game + 1}/${games}: ${found.length} candidates (${stats.mate} mate, ${stats.material} material) from ${stats.positions} positions`)
  }
}
writeFileSync(out, JSON.stringify(found))
console.error(`[seed ${seed}] DONE: ${found.length} candidates`)
engine.quit()
