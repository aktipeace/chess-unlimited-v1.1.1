// Minimal, dependency-free chess rules used ONLY by the data-building scripts in /scripts
// (opening book, puzzle generator). The app itself uses chess.js. This module is checked
// against known perft counts and against Stockfish's own move generator (see scripts/selftest.mjs).

const FILES = 'abcdefgh'
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const sq = (f, r) => FILES[f] + (r + 1)
const parseSq = (s) => [FILES.indexOf(s[0]), Number(s[1]) - 1]
const inside = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8
const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b')

/** Position = { board[r][f] (r=0 is rank 1), turn, castling, ep, half, full }. */
export function parseFen(fen) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/)
  const board = Array.from({ length: 8 }, () => Array(8).fill(null))
  placement.split('/').forEach((row, index) => {
    const r = 7 - index
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch)
      else board[r][f++] = ch
    }
  })
  return { board, turn, castling: castling === '-' ? '' : castling, ep: ep === '-' ? null : ep, half: Number(half ?? 0), full: Number(full ?? 1) }
}

export function toFen(pos) {
  const rows = []
  for (let r = 7; r >= 0; r -= 1) {
    let text = ''
    let empty = 0
    for (let f = 0; f < 8; f += 1) {
      const piece = pos.board[r][f]
      if (!piece) empty += 1
      else {
        if (empty) text += empty
        empty = 0
        text += piece
      }
    }
    if (empty) text += empty
    rows.push(text)
  }
  return `${rows.join('/')} ${pos.turn} ${pos.castling || '-'} ${pos.ep ?? '-'} ${pos.half} ${pos.full}`
}

function findKing(pos, color) {
  const target = color === 'w' ? 'K' : 'k'
  for (let r = 0; r < 8; r += 1) for (let f = 0; f < 8; f += 1) if (pos.board[r][f] === target) return [f, r]
  return null
}

/** Is square (f, r) attacked by a piece of `by`? */
export function attacked(pos, f, r, by) {
  const b = pos.board
  const pawn = by === 'w' ? 'P' : 'p'
  const pr = r + (by === 'w' ? -1 : 1)
  for (const df of [-1, 1]) if (inside(f + df, pr) && b[pr][f + df] === pawn) return true
  const knight = by === 'w' ? 'N' : 'n'
  for (const [df, dr] of KNIGHT) if (inside(f + df, r + dr) && b[r + dr][f + df] === knight) return true
  const king = by === 'w' ? 'K' : 'k'
  for (const [df, dr] of KING) if (inside(f + df, r + dr) && b[r + dr][f + df] === king) return true
  const slide = (dirs, kinds) => {
    for (const [df, dr] of dirs) {
      let x = f + df
      let y = r + dr
      while (inside(x, y)) {
        const piece = b[y][x]
        if (piece) {
          if (colorOf(piece) === by && kinds.includes(piece.toLowerCase())) return true
          break
        }
        x += df
        y += dr
      }
    }
    return false
  }
  return slide(BISHOP, ['b', 'q']) || slide(ROOK, ['r', 'q'])
}

export function inCheck(pos, color = pos.turn) {
  const k = findKing(pos, color)
  return k ? attacked(pos, k[0], k[1], color === 'w' ? 'b' : 'w') : false
}

function pseudoMoves(pos) {
  const out = []
  const { board: b, turn } = pos
  const enemy = turn === 'w' ? 'b' : 'w'
  const push = (from, to, extra = {}) => out.push({ from, to, ...extra })
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      const piece = b[r][f]
      if (!piece || colorOf(piece) !== turn) continue
      const kind = piece.toLowerCase()
      const from = sq(f, r)
      if (kind === 'p') {
        const dir = turn === 'w' ? 1 : -1
        const startRank = turn === 'w' ? 1 : 6
        const lastRank = turn === 'w' ? 7 : 0
        const addPawn = (to, tr, extra = {}) => {
          if (tr === lastRank) for (const promo of ['q', 'r', 'b', 'n']) push(from, to, { promotion: promo, ...extra })
          else push(from, to, extra)
        }
        if (inside(f, r + dir) && !b[r + dir][f]) {
          addPawn(sq(f, r + dir), r + dir)
          if (r === startRank && !b[r + 2 * dir][f]) push(from, sq(f, r + 2 * dir), { double: true })
        }
        for (const df of [-1, 1]) {
          const x = f + df
          const y = r + dir
          if (!inside(x, y)) continue
          const target = b[y][x]
          if (target && colorOf(target) === enemy) addPawn(sq(x, y), y, { capture: true })
          else if (!target && pos.ep === sq(x, y)) push(from, sq(x, y), { capture: true, enPassant: true })
        }
      } else if (kind === 'n' || kind === 'k') {
        for (const [df, dr] of kind === 'n' ? KNIGHT : KING) {
          const x = f + df
          const y = r + dr
          if (!inside(x, y)) continue
          const target = b[y][x]
          if (!target) push(from, sq(x, y))
          else if (colorOf(target) === enemy) push(from, sq(x, y), { capture: true })
        }
        if (kind === 'k') {
          const rank = turn === 'w' ? 0 : 7
          if (f === 4 && r === rank && !attacked(pos, 4, rank, enemy)) {
            const rook = turn === 'w' ? 'R' : 'r'
            const ks = turn === 'w' ? 'K' : 'k'
            const qs = turn === 'w' ? 'Q' : 'q'
            if (pos.castling.includes(ks) && b[rank][7] === rook && !b[rank][5] && !b[rank][6] && !attacked(pos, 5, rank, enemy) && !attacked(pos, 6, rank, enemy)) push(from, sq(6, rank), { castle: 'k' })
            if (pos.castling.includes(qs) && b[rank][0] === rook && !b[rank][1] && !b[rank][2] && !b[rank][3] && !attacked(pos, 3, rank, enemy) && !attacked(pos, 2, rank, enemy)) push(from, sq(2, rank), { castle: 'q' })
          }
        }
      } else {
        const dirs = kind === 'b' ? BISHOP : kind === 'r' ? ROOK : [...BISHOP, ...ROOK]
        for (const [df, dr] of dirs) {
          let x = f + df
          let y = r + dr
          while (inside(x, y)) {
            const target = b[y][x]
            if (!target) push(from, sq(x, y))
            else {
              if (colorOf(target) === enemy) push(from, sq(x, y), { capture: true })
              break
            }
            x += df
            y += dr
          }
        }
      }
    }
  }
  return out
}

/** Applies a move (assumed pseudo-legal) and returns the new position. */
export function applyMove(pos, move) {
  const board = pos.board.map((row) => [...row])
  const [ff, fr] = parseSq(move.from)
  const [tf, tr] = parseSq(move.to)
  const piece = board[fr][ff]
  const kind = piece.toLowerCase()
  const captured = board[tr][tf]
  board[fr][ff] = null
  board[tr][tf] = move.promotion ? (pos.turn === 'w' ? move.promotion.toUpperCase() : move.promotion) : piece
  if (move.enPassant) board[fr][tf] = null
  if (move.castle === 'k') {
    board[fr][5] = board[fr][7]
    board[fr][7] = null
  } else if (move.castle === 'q') {
    board[fr][3] = board[fr][0]
    board[fr][0] = null
  }
  let castling = pos.castling
  const drop = (letters) => { for (const l of letters) castling = castling.replace(l, '') }
  if (piece === 'K') drop('KQ')
  if (piece === 'k') drop('kq')
  const touch = (s) => {
    if (s === 'a1') drop('Q')
    if (s === 'h1') drop('K')
    if (s === 'a8') drop('q')
    if (s === 'h8') drop('k')
  }
  touch(move.from)
  touch(move.to)
  return {
    board,
    turn: pos.turn === 'w' ? 'b' : 'w',
    castling,
    ep: move.double ? sq(ff, (fr + tr) / 2) : null,
    half: kind === 'p' || captured || move.enPassant ? 0 : pos.half + 1,
    full: pos.turn === 'b' ? pos.full + 1 : pos.full,
  }
}

export function legalMoves(pos) {
  return pseudoMoves(pos).filter((move) => !inCheck(applyMove(pos, move), pos.turn))
}

export const uciOf = (move) => `${move.from}${move.to}${move.promotion ?? ''}`

export function isCheckmate(pos) {
  return inCheck(pos) && legalMoves(pos).length === 0
}
export function isStalemate(pos) {
  return !inCheck(pos) && legalMoves(pos).length === 0
}

/** SAN for a legal move in `pos` (with check / mate suffix). */
export function sanOf(pos, move) {
  const piece = pos.board[parseSq(move.from)[1]][parseSq(move.from)[0]]
  const kind = piece.toLowerCase()
  let text
  if (move.castle) text = move.castle === 'k' ? 'O-O' : 'O-O-O'
  else if (kind === 'p') {
    text = (move.capture ? move.from[0] + 'x' : '') + move.to + (move.promotion ? '=' + move.promotion.toUpperCase() : '')
  } else {
    const others = legalMoves(pos).filter((m) => m.to === move.to && m.from !== move.from && pos.board[parseSq(m.from)[1]][parseSq(m.from)[0]] === piece)
    let disambiguation = ''
    if (others.length) {
      const sameFile = others.some((m) => m.from[0] === move.from[0])
      const sameRank = others.some((m) => m.from[1] === move.from[1])
      if (!sameFile) disambiguation = move.from[0]
      else if (!sameRank) disambiguation = move.from[1]
      else disambiguation = move.from
    }
    text = kind.toUpperCase() + disambiguation + (move.capture ? 'x' : '') + move.to
  }
  const next = applyMove(pos, move)
  if (isCheckmate(next)) text += '#'
  else if (inCheck(next)) text += '+'
  return text
}

/** Finds the legal move matching a UCI string, or null. */
export function moveFromUci(pos, uci) {
  return legalMoves(pos).find((m) => uciOf(m) === uci) ?? null
}

/** Finds the legal move matching SAN (tolerates +, #, !, ? suffixes and 0-0 spelling). */
export function moveFromSan(pos, san) {
  const clean = san.replace(/[+#!?]+$/g, '').replace(/0/g, 'O').replace('=', '')
  return legalMoves(pos).find((m) => sanOf(pos, m).replace(/[+#]+$/g, '').replace('=', '') === clean) ?? null
}

export function perft(pos, depth) {
  if (depth === 0) return 1
  const moves = legalMoves(pos)
  if (depth === 1) return moves.length
  let total = 0
  for (const move of moves) total += perft(applyMove(pos, move), depth - 1)
  return total
}

/** Plays a SAN list from `fen`; returns { uci: string[], fens: string[] } or throws on an illegal move. */
export function playSan(sanMoves, fen = START_FEN) {
  let pos = parseFen(fen)
  const uci = []
  const fens = [toFen(pos)]
  for (const san of sanMoves) {
    const move = moveFromSan(pos, san)
    if (!move) throw new Error(`Illegal SAN "${san}" at ${toFen(pos)}`)
    uci.push(uciOf(move))
    pos = applyMove(pos, move)
    fens.push(toFen(pos))
  }
  return { uci, fens, pos }
}

/** Plays UCI moves from `fen`. */
export function playUci(uciMoves, fen = START_FEN) {
  let pos = parseFen(fen)
  const sans = []
  for (const uci of uciMoves) {
    const move = moveFromUci(pos, uci)
    if (!move) throw new Error(`Illegal UCI "${uci}" at ${toFen(pos)}`)
    sans.push(sanOf(pos, move))
    pos = applyMove(pos, move)
  }
  return { sans, pos, fen: toFen(pos) }
}
