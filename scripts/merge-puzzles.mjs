// Re-verifies candidate puzzles at a higher depth and writes src/features/training/puzzleData.ts.
// Usage: node scripts/merge-puzzles.mjs /tmp/puz-main.json /tmp/puz-mate.json
// A puzzle only ships when, at depth 18: (mate) every solver move keeps the shortest forced mate and the line ends in
// checkmate; (material) the first move is the clear best (>= 200 cp better than the 2nd) and the solver really wins material.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Engine } from './lib/engine.mjs'
import { applyMove, isCheckmate, moveFromUci, parseFen, toFen, playUci } from './lib/minichess.mjs'

const DEPTH = Number(process.env.DEPTH ?? 18)
const CAPS = { mate1: 14, mate2: 18, mate3: 14, material: 44 }
const files = process.argv.slice(2)
if (!files.length) throw new Error('Pass candidate JSON files.')

const seen = new Set()
const candidates = []
for (const file of files) {
  for (const item of JSON.parse(readFileSync(file, 'utf8'))) {
    const key = item.fen.split(' ').slice(0, 2).join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(item)
  }
}
console.error(`${candidates.length} unique candidates`)

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const net = (pos, color) => {
  let total = 0
  for (const row of pos.board) for (const piece of row) {
    if (!piece || piece.toLowerCase() === 'k') continue
    total += ((piece === piece.toUpperCase()) === (color === 'w') ? 1 : -1) * VALUE[piece.toLowerCase()]
  }
  return total
}

const engine = await new Engine({ hash: 128, threads: 1 }).init()
const accepted = []
const rejected = []
let done = 0
for (const candidate of candidates) {
  if (++done % 10 === 0) console.error(`verified ${done}/${candidates.length} (accepted ${accepted.length})`)
  const { fen, solution, theme } = candidate
  const reasons = []
  try {
    playUci(solution, fen) // every move legal
    const solver = fen.split(' ')[1]
    let pos = parseFen(fen)
    const solverMoves = Math.ceil(solution.length / 2)
    for (let step = 0; step < solverMoves; step += 1) {
      const here = toFen(pos)
      const res = await engine.search(here, DEPTH, 2)
      const top = res.lines[0]
      const second = res.lines[1] ?? null
      if (!top || top.pv[0] !== solution[step * 2]) { reasons.push(`step ${step}: engine prefers ${top?.pv[0]}`); break }
      if (/^mate\d$/.test(theme)) {
        const need = Number(theme.slice(4)) - step
        if (top.mate !== need) reasons.push(`step ${step}: expected mate in ${need}, got ${top.mate ?? top.cp}`)
        if (second && second.mate !== null && second.mate > 0 && second.mate <= need) reasons.push(`step ${step}: second move also mates in ${second.mate}`)
      } else if (step === 0) {
        if (top.mate !== null || top.cp < 250) reasons.push(`weak advantage ${top.cp}`)
        if (second && second.mate === null && top.cp - second.cp < 200) reasons.push(`second move too close (${second.cp} vs ${top.cp})`)
        if (second && second.mate !== null && second.mate > 0) reasons.push('second move also mates')
      } else if (second && second.mate === null && top.cp - second.cp < 100) {
        reasons.push(`step ${step}: alternative nearly as good`)
      }
      if (reasons.length) break
      pos = applyMove(pos, moveFromUci(pos, solution[step * 2]))
      if (step * 2 + 1 < solution.length) pos = applyMove(pos, moveFromUci(pos, solution[step * 2 + 1]))
    }
    if (!reasons.length) {
      if (/^mate\d$/.test(theme)) {
        if (!isCheckmate(pos)) reasons.push('line does not end in checkmate')
      } else {
        const gain = net(pos, solver) - net(parseFen(fen), solver)
        if (gain < 2) reasons.push(`material gain only ${gain}`)
      }
    }
  } catch (error) {
    reasons.push(error.message)
  }
  if (reasons.length) rejected.push({ fen, theme, reasons })
  else accepted.push(candidate)
}
engine.quit()
console.error(`accepted ${accepted.length}, rejected ${rejected.length}`)
for (const r of rejected.slice(0, 8)) console.error(' -', r.theme, r.reasons.join('; '))

// Choose the final set within the caps, preferring shorter / cleaner positions (fewer pieces first is easier to read).
const pieces = (fen) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length
const counts = { mate1: 0, mate2: 0, mate3: 0, material: 0 }
const chosen = []
for (const item of [...accepted].sort((a, b) => pieces(a.fen) - pieces(b.fen) || b.gap - a.gap)) {
  if (counts[item.theme] >= CAPS[item.theme]) continue
  counts[item.theme] += 1
  chosen.push(item)
}
const levelOf = (item) => (item.theme === 'mate1' ? 1 : item.theme === 'mate3' ? 3 : item.theme === 'mate2' ? 2 : Math.ceil(item.solution.length / 2) >= 2 ? 3 : 2)
const TITLES = { mate1: 'Skakmat dalam 1 langkah', mate2: 'Skakmat dalam 2 langkah', mate3: 'Skakmat dalam 3 langkah', material: 'Menangkan materi' }
chosen.sort((a, b) => levelOf(a) - levelOf(b) || pieces(a.fen) - pieces(b.fen))
const rows = chosen.map((item, index) => ({
  id: `p${String(index + 1).padStart(3, '0')}`,
  theme: item.theme,
  fen: item.fen,
  solution: item.solution,
  title: TITLES[item.theme],
  level: levelOf(item),
}))
const body = rows
  .map((r) => `  { id: ${JSON.stringify(r.id)}, kind: 'puzzle', theme: ${JSON.stringify(r.theme)}, fen: ${JSON.stringify(r.fen)}, solution: ${JSON.stringify(r.solution)}, title: ${JSON.stringify(r.title)}, level: ${r.level} },`)
  .join('\n')
mkdirSync('src/features/training', { recursive: true })
writeFileSync(
  'src/features/training/puzzleData.ts',
  `// GENERATED by scripts/gen-puzzles.mjs + scripts/merge-puzzles.mjs — do not edit by hand.
// ${rows.length} puzzles found by Stockfish self-play and re-verified at depth ${DEPTH}:
//  - mate puzzles: every solver move keeps the shortest forced mate and the line ends in checkmate;
//  - material puzzles: the first move is at least 200 cp better than any other and the solver ends >= 2 points of material up.
import type { TrainingItem } from './trainingModel'

export const PUZZLES: TrainingItem[] = [
${body}
]
`,
)
console.error(`wrote ${rows.length} puzzles:`, JSON.stringify(counts))
