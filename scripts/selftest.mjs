// Verifies the dev chess module against published perft numbers and against Stockfish's own generator.
import { Engine } from './lib/engine.mjs'
import { START_FEN, parseFen, perft, legalMoves, uciOf, playSan, toFen } from './lib/minichess.mjs'

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'
const cases = [
  [START_FEN, 4, 197281],
  [KIWIPETE, 3, 97862],
  [POS3, 4, 43238],
  [POS4, 3, 9467],
]
let failed = 0
for (const [fen, depth, expected] of cases) {
  const got = perft(parseFen(fen), depth)
  const ok = got === expected
  if (!ok) failed += 1
  console.log(`${ok ? 'OK  ' : 'FAIL'} perft(${depth}) ${fen.slice(0, 30)}… = ${got} (expected ${expected})`)
}

const engine = await new Engine().init()
for (const [fen] of cases) {
  const mine = legalMoves(parseFen(fen)).map(uciOf).sort()
  const theirs = (await engine.legal(fen)).sort()
  const ok = JSON.stringify(mine) === JSON.stringify(theirs)
  if (!ok) failed += 1
  console.log(`${ok ? 'OK  ' : 'FAIL'} legal moves agree with Stockfish (${mine.length}) ${fen.slice(0, 24)}…`)
}
const opera = playSan('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' '))
console.log(`${opera.uci.length === 33 ? 'OK  ' : 'FAIL'} Opera Game parses (${opera.uci.length} plies), final ${toFen(opera.pos)}`)
if (opera.uci.length !== 33) failed += 1
engine.quit()
console.log(failed ? `\n${failed} FAILED` : '\nAll self-tests passed.')
process.exit(failed ? 1 : 0)
