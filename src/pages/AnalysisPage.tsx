import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chess, type Square } from 'chess.js'
import { Activity, ArrowDownUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Cpu, Download, FileUp, Maximize2, Minimize2, Play, RotateCcw, Save, Square as StopIcon, Trash2 } from 'lucide-react'
import { useStockfish } from '../features/analysis/useStockfish'
import type { EngineLine } from '../features/analysis/engine.types'
import {
  START_FEN,
  chessAt,
  fromFen,
  fromPgn,
  gameStatus,
  goTo,
  kingSquare,
  moveRows,
  needsPromotion,
  newGame,
  toPgn,
  tryMove,
  type GameState,
} from '../features/analysis/gameModel'
import { saveGameToLibrary } from '../features/library/libraryStore'
import { bookDepth, detectOpening, uciMovesOf } from '../features/openings/openingModel'
import { clearPendingGame, peekPendingGame, setPendingGame } from '../features/review/pendingGame'
import { updateSettings, useSettings } from '../features/settings/settingsStore'
import { PIECE_STYLES, PIECE_STYLE_LABELS, type PieceStyle } from '../features/settings/settingsModel'
import { DragGhost, Piece } from '../components/board/Piece'
import { useBoardDrag } from '../components/board/useBoardDrag'
import { useIsMobile } from '../lib/useIsMobile'
import { useBoardAnnotations } from '../components/board/useBoardAnnotations'
import { useBoardFocus } from '../components/board/useBoardFocus'

const FILES = 'abcdefgh'
const ARROW_COLORS = ['#a8e063', '#55c7b4', '#70a7ff', '#d7a6ff', '#ffb86b']
const ARROW_NAMES = ['Hijau', 'Tosca', 'Biru', 'Ungu', 'Oranye']
const arrowColor = (id: number) => ARROW_COLORS[id - 1] ?? ARROW_COLORS[0]

const PROMOTION_CHOICES = [
  { type: 'q', name: 'Ratu' },
  { type: 'r', name: 'Benteng' },
  { type: 'b', name: 'Gajah' },
  { type: 'n', name: 'Kuda' },
] as const

type Score = EngineLine['score']

// Stockfish reports scores from the point of view of the side to move; the UI shows them from
// White's point of view (positive = White is better), which is what the bars expect.
function whiteScore(line: EngineLine | undefined, turn: 'w' | 'b'): Score | undefined {
  if (!line) return undefined
  return turn === 'w' ? line.score : { type: line.score.type, value: 0 - line.score.value }
}

function formatScore(score?: Score) {
  if (!score) return '—'
  if (score.type === 'mate') return score.value >= 0 ? `M${score.value}` : `-M${Math.abs(score.value)}`
  const pawns = score.value / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}

/** Share (0-100) of the evaluation bar that belongs to White. */
function whiteShare(score?: Score) {
  if (!score) return 50
  if (score.type === 'mate') return score.value > 0 ? 95 : 5
  return Math.max(5, Math.min(95, 50 + score.value / 12))
}

function formatVariation(position: Chess, pv: string[]) {
  const cursor = new Chess(position.fen())
  const san: string[] = []
  for (const uci of pv) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break
    try {
      const move = cursor.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || 'q' })
      if (!move) break
      san.push(move.san)
    } catch { break }
  }
  return san.join(' ')
}

export function AnalysisPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  // A game sent from Game Review ('Open in Analysis') arrives through the hand-off slot.
  const [state, setState] = useState<GameState>(() => peekPendingGame() ?? newGame())
  const [selected, setSelected] = useState<Square | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [boardTheme, setBoardTheme] = useState<string>(settings.boardTheme)
  const [analysisNonce, setAnalysisNonce] = useState(0)
  const [fenInput, setFenInput] = useState('')
  const [pgnText, setPgnText] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const engine = useStockfish()
  const isMobile = useIsMobile()
  const moveListRef = useRef<HTMLOListElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const boardColumnRef = useRef<HTMLElement | null>(null)
  const annotations = useBoardAnnotations()
  const boardFocus = useBoardFocus()

  useEffect(() => {
    clearPendingGame()
  }, [])

  const position = useMemo(() => chessAt(state), [state])
  const fen = position.fen()
  const turn = position.turn()
  const status = useMemo(() => gameStatus(position), [position])
  const rows = useMemo(() => moveRows(state), [state])
  const lastMove = state.cursor > 0 ? state.moves[state.cursor - 1] : null
  const checkedKing = status.check ? kingSquare(position, turn) : null
  const opening = useMemo(
    () => (state.startFen === START_FEN ? detectOpening(uciMovesOf(state.moves.slice(0, state.cursor))) : null),
    [state.startFen, state.moves, state.cursor],
  )

  const leftBookAt = useMemo(() => (state.startFen === START_FEN ? bookDepth(uciMovesOf(state.moves)) : 0), [state.startFen, state.moves])

  // Analyze every shown position, including after stepping through the move list. The FEN and
  // nonce dependencies prevent render loops; the nonce restarts the search after Reset / Load
  // even when the resulting FEN is identical to the previous one.
  useEffect(() => {
    if (engine.ready) engine.analyze(fen)
  }, [fen, analysisNonce, engine.ready, engine.analyze])

  // Keyboard: ← → step through the line, Home/End jump, Esc cancels a promotion or selection.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const apply = (change: (current: GameState) => GameState) => {
        event.preventDefault()
        setState(change)
        setSelected(null)
        setPendingPromotion(null)
      }
      if (event.key === 'ArrowLeft') apply((current) => goTo(current, current.cursor - 1))
      else if (event.key === 'ArrowRight') apply((current) => goTo(current, current.cursor + 1))
      else if (event.key === 'Home') apply((current) => goTo(current, 0))
      else if (event.key === 'End') apply((current) => goTo(current, current.moves.length))
      else if (event.key === 'Escape') {
        setSelected(null)
        setPendingPromotion(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Keep the active move visible inside the (scrollable) move list without scrolling the page.
  useEffect(() => {
    const list = moveListRef.current
    const chip = list?.querySelector<HTMLElement>('.move-chip.active')
    if (!list || !chip) return
    if (chip.offsetTop < list.scrollTop) list.scrollTop = chip.offsetTop
    else if (chip.offsetTop + chip.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = chip.offsetTop + chip.offsetHeight - list.clientHeight
    if (chip.offsetLeft < list.scrollLeft) list.scrollLeft = Math.max(0, chip.offsetLeft - 8)
    else if (chip.offsetLeft + chip.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = chip.offsetLeft + chip.offsetWidth - list.clientWidth + 8
  }, [state.cursor, state.moves.length])

  const boardRows = useMemo(() => {
    const grid = position.board()
    return flipped ? [...grid].reverse().map((row) => [...row].reverse()) : grid
  }, [position, flipped])
  const legalTargets = selected ? position.moves({ square: selected, verbose: true }).map((move) => move.to) : []

  // Only trust engine output that belongs to the position on the board.
  const fresh = engine.analyzedFen === fen
  const lines = fresh ? engine.lines : []
  const topLine = lines[0]
  const topScore = whiteScore(topLine, turn)
  const evalText = status.over ? (status.result === '1/2-1/2' ? '½-½' : status.result ?? '—') : formatScore(topScore)
  const whitePercent = status.over ? (status.result === '1-0' ? 100 : status.result === '0-1' ? 0 : 50) : whiteShare(topScore)
  const blackPercent = 100 - whitePercent
  const bestSan = fresh && !status.over && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(engine.bestMove) ? formatVariation(position, [engine.bestMove]) : ''
  const bestMoveText = status.over || !fresh ? '—' : bestSan ? `${bestSan} · ${engine.bestMove}` : engine.bestMove
  const pvArrows = lines.slice(0, engine.settings.multiPv).flatMap((line) => {
    const uci = line.pv[0]
    if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return []
    const from = uci.slice(0, 2) as Square
    const to = uci.slice(2, 4) as Square
    const point = (square: Square) => {
      const file = FILES.indexOf(square[0])
      const rank = Number(square[1])
      return { x: (flipped ? 7 - file : file) * 12.5 + 6.25, y: (flipped ? rank - 1 : 8 - rank) * 12.5 + 6.25 }
    }
    return [{ from: point(from), to: point(to), id: line.multipv }]
  })

  function jumpTo(cursor: number) {
    setState((current) => goTo(current, cursor))
    setSelected(null)
    setPendingPromotion(null)
  }

  function commitMove(from: Square, to: Square, promotion?: string) {
    const next = tryMove(state, from, to, promotion)
    setPendingPromotion(null)
    setSelected(null)
    if (next) setState(next)
  }

  function playSquare(square: Square) {
    if (pendingPromotion || consumeClick()) return
    if (selected && selected !== square) {
      const candidates = position.moves({ square: selected, verbose: true }).filter((move) => move.to === square)
      if (candidates.length) {
        if (needsPromotion(position, selected, square)) setPendingPromotion({ from: selected, to: square })
        else commitMove(selected, square)
        return
      }
    }
    const piece = position.get(square)
    if (piece?.color === turn && selected !== square) setSelected(square)
    else setSelected(null)
  }

  const { drag, bind: bindDrag, consumeClick } = useBoardDrag({
    canDrag: (square) => !pendingPromotion && position.get(square as Square)?.color === turn,
    onDragStart: (square) => { if (selected !== square) setSelected(square as Square) },
    onDrop: (from, to) => {
      if (position.moves({ square: from as Square, verbose: true }).some((move) => move.to === to)) {
        if (needsPromotion(position, from as Square, to as Square)) setPendingPromotion({ from: from as Square, to: to as Square })
        else commitMove(from as Square, to as Square)
      } else setSelected(null)
    },
  })
  const dragPiece = drag ? position.get(drag.from as Square) : null

  function loadState(next: GameState, message: string) {
    setState(next)
    setSelected(null)
    setPendingPromotion(null)
    setAnalysisNonce((value) => value + 1)
    setNotice({ kind: 'ok', text: message })
  }

  function resetBoard() {
    setState(newGame())
    setSelected(null)
    setPendingPromotion(null)
    setNotice(null)
    setAnalysisNonce((value) => value + 1)
    engine.reset()
  }

  function loadFen() {
    const next = fromFen(fenInput)
    if (!next) {
      setNotice({ kind: 'error', text: 'FEN tidak valid. Contoh: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })
      return
    }
    loadState(next, 'Posisi dimuat dari FEN.')
  }

  function loadPgn(text: string = pgnText) {
    const next = fromPgn(text)
    if (!next) {
      setNotice({ kind: 'error', text: 'PGN tidak valid atau tidak berisi langkah.' })
      return
    }
    loadState(next, `PGN dimuat: ${next.moves.length} langkah. Telusuri dengan tombol panah atau daftar langkah.`)
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ kind: 'ok', text: `${label} disalin ke clipboard.` })
    } catch {
      setNotice({ kind: 'error', text: 'Clipboard tidak tersedia (butuh HTTPS atau localhost). Salin manual dari kolom teks.' })
    }
  }

  function exportPgn() {
    const pgn = toPgn(state)
    setPgnText(pgn)
    void copyText(pgn, 'PGN')
  }

  function saveGame() {
    const outcome = saveGameToLibrary(state)
    setNotice(outcome.ok ? { kind: 'ok', text: outcome.created ? 'Permainan disimpan ke Library.' : 'Permainan di Library diperbarui.' } : { kind: 'error', text: 'Browser menolak menyimpan data (penyimpanan penuh atau diblokir).' })
  }

  function reviewGame() {
    setPendingGame(state)
    navigate('/review')
  }

  function downloadPgn() {
    const url = URL.createObjectURL(new Blob([toPgn(state)], { type: 'application/x-chess-pgn' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'chess-unlimited.pgn'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setPgnText(text)
      loadPgn(text)
    } catch {
      setNotice({ kind: 'error', text: 'File tidak bisa dibaca.' })
    }
    input.value = ''
  }

  const renderChip = (entry: { san: string; ply: number }) => (
    <button className={`move-chip${state.cursor === entry.ply ? ' active' : ''}`} aria-current={state.cursor === entry.ply ? 'step' : undefined} onClick={() => jumpTo(entry.ply)}>{entry.san}</button>
  )

  return (
    <div className="page analysis-page studio-page">
      <div className="analysis-heading">
        <div><div className="eyebrow">CHESS UNLIMITED / ENGINE WORKSPACE</div><h1>Analysis <span>Studio</span></h1><p>Automatic move-by-move guidance powered by your local Stockfish engine.</p></div>
        <div className="engine-status"><i className={engine.ready ? 'status-ready' : ''} />{engine.status}</div>
      </div>

      <div className="analysis-layout">
        <section ref={boardColumnRef} className={`board-column${boardFocus.focused ? ' board-focus-mode' : ''}`}>
          <div className="board-toolbar"><span>LIVE BOARD <b>·</b> {boardTheme.toUpperCase()}</span><div className="board-toolbar-actions"><select aria-label="Board theme" className="theme-select" value={boardTheme} onChange={(e) => setBoardTheme(e.target.value)}><option value="classic">Classic</option><option value="emerald">Emerald</option><option value="ocean">Ocean</option><option value="walnut">Walnut</option><option value="violet">Violet</option></select><select aria-label="Bentuk bidak" className="theme-select piece-select" value={settings.pieceStyle} onChange={(e) => updateSettings({ pieceStyle: e.target.value as PieceStyle })}>{PIECE_STYLES.map((style) => <option key={style} value={style}>{PIECE_STYLE_LABELS[style]}</option>)}</select><button onClick={() => setFlipped((value) => !value)} title="Flip board" aria-label="Flip board"><ArrowDownUp size={15} /></button><button onClick={resetBoard} title="Reset board" aria-label="Reset board"><RotateCcw size={15} /></button><button onClick={annotations.clearArrows} title="Hapus semua panah" aria-label="Hapus semua panah" disabled={!annotations.arrows.length}><Trash2 size={15} /></button><button onClick={() => void boardFocus.toggle(boardColumnRef.current)} title={boardFocus.focused ? "Keluar fokus papan" : "Fokus papan"} aria-label={boardFocus.focused ? "Keluar fokus papan" : "Fokus papan"}>{boardFocus.focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div></div>
          <div className="board-frame">
            <div className="eval-rail"><div className="eval-black" style={{ height: `${blackPercent}%`, ...(flipped ? { top: 'auto', bottom: 0 } : {}) }} /><div className="eval-white" /><span>{evalText}</span></div>
            <div className="chess-board-wrap">
            <div className={`chess-board theme-${boardTheme}`} role="grid" aria-label="Chess board" onPointerDown={annotations.onPointerDown} onContextMenu={annotations.onContextMenu}>
              {boardRows.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
                const rank = flipped ? rowIndex + 1 : 8 - rowIndex
                const file = flipped ? 7 - colIndex : colIndex
                const square = `${FILES[file]}${rank}` as Square
                const light = (rowIndex + colIndex) % 2 === 0
                const isSelected = selected === square
                const isTarget = legalTargets.includes(square)
                const isLastMove = Boolean(lastMove && (lastMove.from === square || lastMove.to === square))
                const isCheckedKing = checkedKing === square
                return <button key={square} role="gridcell" aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`} data-square={square} {...bindDrag(square)} onClick={() => playSquare(square)} className={`board-square ${light ? 'light' : 'dark'}${piece && piece.color === turn && !pendingPromotion ? ' can-drag' : ''}${drag?.from === square ? ' drag-source' : ''}${isSelected ? ' selected' : ''}${isTarget ? ' legal-target' : ''}${isLastMove ? ' last-move' : ''}${isCheckedKing ? ' in-check' : ''}`}>
                  {piece && <Piece color={piece.color} type={piece.type} style={settings.pieceStyle} textPresentation={isMobile} />}
                  {colIndex === 0 && <small className="rank-coordinate">{rank}</small>}
                  {rowIndex === 7 && <small className="file-coordinate">{FILES[file]}</small>}
                </button>
              }))}
            </div>
            {(pvArrows.length > 0 || annotations.arrows.length > 0) && <svg className="pv-arrows" viewBox="0 0 100 100" aria-label="Principal variation move arrows">
              <defs>{pvArrows.map((arrow) => <marker key={arrow.id} id={`pv-arrow-${arrow.id}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill={arrowColor(arrow.id)} /></marker>)}</defs>
              {pvArrows.map((arrow) => <line key={arrow.id} x1={arrow.from.x} y1={arrow.from.y} x2={arrow.to.x} y2={arrow.to.y} stroke={arrowColor(arrow.id)} strokeWidth="1.25" strokeLinecap="round" markerEnd={`url(#pv-arrow-${arrow.id})`} opacity={arrow.id === 1 ? 0.95 : 0.72} />)}
              {pvArrows.map((arrow) => <g key={`badge-${arrow.id}`}><circle cx={arrow.from.x + 4} cy={arrow.from.y + 4} r="2.7" fill={arrowColor(arrow.id)} stroke="#14160f" strokeWidth=".35" /><text x={arrow.from.x + 4} y={arrow.from.y + 4.2} textAnchor="middle" dominantBaseline="central" fontSize="3.6" fontWeight="800" fill="#14160f">{arrow.id}</text></g>)}
              {annotations.arrows.map((arrow, index) => {
                const point = (square: Square) => { const file = FILES.indexOf(square[0]); const rank = Number(square[1]); return { x: (flipped ? 7 - file : file) * 12.5 + 6.25, y: (flipped ? rank - 1 : 8 - rank) * 12.5 + 6.25 } }
                const from = point(arrow.from); const to = point(arrow.to); const marker = `user-arrow-${index}`
                return <g key={`${arrow.from}-${arrow.to}`}><defs><marker id={marker} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill={arrow.color} /></marker></defs><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={arrow.color} strokeWidth="1.55" strokeLinecap="round" markerEnd={`url(#${marker})`} opacity=".95" /></g>
              })}
            </svg>}
            {pendingPromotion && <div className="promotion-overlay" role="dialog" aria-label="Pilih bidak promosi" onClick={() => setPendingPromotion(null)}>
              <div className="promotion-card" onClick={(event) => event.stopPropagation()}>
                <span className="promotion-title">PROMOSI PION</span>
                <div className="promotion-options">
                  {PROMOTION_CHOICES.map(({ type, name }) => <button key={type} aria-label={name} title={name} onClick={() => commitMove(pendingPromotion.from, pendingPromotion.to, type)}><Piece color={turn} type={type} style={settings.pieceStyle} textPresentation={isMobile} /></button>)}
                </div>
                <button className="promotion-cancel" onClick={() => setPendingPromotion(null)}>Batal</button>
              </div>
            </div>}
            {drag && dragPiece && <DragGhost x={drag.x} y={drag.y} size={drag.size} color={dragPiece.color} type={dragPiece.type} style={settings.pieceStyle} textPresentation={isMobile} />}
            </div>
          </div>
          <div className="board-footer"><span>{status.over ? 'FINISHED' : `${turn === 'w' ? 'WHITE' : 'BLACK'} TO MOVE`}</span><span>{status.label}</span><span>{state.cursor === state.moves.length ? state.cursor : `${state.cursor} / ${state.moves.length}`} PLY</span></div>
          <div className="board-nav" role="group" aria-label="Move navigation">
            <button onClick={() => jumpTo(0)} disabled={state.cursor === 0} aria-label="First position" title="First (Home)"><ChevronsLeft size={18} /></button>
            <button onClick={() => jumpTo(state.cursor - 1)} disabled={state.cursor === 0} aria-label="Previous move" title="Previous (←)"><ChevronLeft size={18} /></button>
            <button onClick={() => jumpTo(state.cursor + 1)} disabled={state.cursor === state.moves.length} aria-label="Next move" title="Next (→)"><ChevronRight size={18} /></button>
            <button onClick={() => jumpTo(state.moves.length)} disabled={state.cursor === state.moves.length} aria-label="Last position" title="Last (End)"><ChevronsRight size={18} /></button>
          </div>
        </section>

        <aside className="engine-column">
          <div className="side-grid">
            <div className="side-col side-col-a">
            <section className="review-card opening-card" aria-label="Pembukaan">
              <div className="moves-heading"><div className="eyebrow"><BookOpen size={13} /> PEMBUKAAN</div>{opening && <span className="eco-badge">ECO {opening.eco}</span>}</div>
              {opening ? (
                <>
                  <strong className="opening-name">{opening.name}</strong>
                  <p className="current-sub">{state.cursor <= leftBookAt ? `Posisi ini masih di buku pembukaan (langkah ke-${state.cursor} dari ${leftBookAt}).` : `Keluar dari buku pembukaan setelah langkah ke-${leftBookAt}; nama di atas adalah pembukaan terdekat.`}</p>
                </>
              ) : (
                <p className="current-sub">{state.startFen !== START_FEN ? 'Posisi kustom (FEN): pembukaan tidak dideteksi.' : state.cursor === 0 ? 'Posisi awal. Mainkan langkah pertama dan nama pembukaan akan muncul di sini.' : 'Belum cocok dengan buku pembukaan.'}</p>
              )}
            </section>
            <section className="moves-card">
              <div className="moves-heading"><div className="eyebrow">MOVE LIST</div><span>{state.moves.length} PLY</span></div>
              {rows.length ? <ol className="move-list" ref={moveListRef}>{rows.map((row) => <li className="move-row" key={row.number}><span className="move-number">{row.number}.</span>{row.white ? renderChip(row.white) : <span className="move-chip empty">…</span>}{row.black && renderChip(row.black)}</li>)}</ol> : <div className="pv-empty"><ChevronDown size={15} /><span>Belum ada langkah — mainkan di papan atau impor PGN.</span></div>}
            </section>
            <section className="review-card review-launch">
              <div className="eyebrow">GAME REVIEW</div>
              <h3>Telusuri titik balik permainan</h3>
              <p className="current-sub">Stockfish menilai setiap langkah, lalu menghitung akurasi kedua pemain. {state.moves.length ? `${state.moves.length} langkah siap direview.` : 'Mainkan langkah di papan atau impor PGN dulu.'}</p>
              <div className="review-run">
                <button className="analyze-button" onClick={reviewGame} disabled={!state.moves.length}><Play size={16} fill="currentColor" /> Review game</button>
                <button className="mini-button text" onClick={saveGame} disabled={!state.moves.length}><Save size={15} /> Simpan ke Library</button>
              </div>
              {notice && <p className={`game-notice ${notice.kind}`} role="status">{notice.text}</p>}
            </section>
            <section className="review-card legend-card" aria-label="Keterangan papan">
              <div className="eyebrow">KETERANGAN PAPAN</div>
              <h3>Arti warna dan panah</h3>
              <p className="legend-title">Panah engine (nomor sama dengan baris di Principal variations)</p>
              <ul className="legend-list">
                {ARROW_COLORS.slice(0, engine.settings.multiPv).map((color, index) => <li key={color}><i className="swatch arrow" style={{ background: color, color }} /><span><b>{ARROW_NAMES[index]} · #{index + 1}</b>{index === 0 ? ' langkah terbaik' : ` kandidat ke-${index + 1}`}</span></li>)}
              </ul>
              <p className="legend-title">Penanda kotak</p>
              <ul className="legend-list">
                <li><i className="swatch" style={{ background: '#d9d36a' }} /><span><b>Kuning</b> langkah terakhir yang dimainkan</span></li>
                <li><i className="swatch" style={{ background: '#a9c35a' }} /><span><b>Hijau muda</b> bidak yang sedang dipilih</span></li>
                <li><i className="swatch dot" /><span><b>Titik / lingkaran</b> langkah legal bidak terpilih</span></li>
                <li><i className="swatch" style={{ background: '#e84c3d' }} /><span><b>Merah</b> raja sedang skak</span></li>
              </ul>
              <p className="legend-title">Bar evaluasi (kiri papan)</p>
              <p className="current-sub">Bagian terang = keunggulan Putih, bagian gelap = keunggulan Hitam. Angka positif (+) menguntungkan Putih, negatif (−) menguntungkan Hitam; M3 berarti skakmat dalam 3 langkah.</p>
            </section>
            </div>
            <div className="side-col side-col-b">
            <section className="evaluation-card">
              <div className="eyebrow">POSITION EVALUATION</div><div className="evaluation-value">{evalText}<small>{status.over ? ' result' : topScore?.type === 'mate' ? ' mate' : ' pawns'}</small></div><div className="evaluation-bar"><i style={{ width: `${blackPercent}%` }} /></div>
              <div className="best-move"><div><span>BEST MOVE</span><strong>{bestMoveText}</strong></div><Activity size={18} /></div>
            </section>
            <section className="lines-card">
              <div className="lines-heading"><div><div className="eyebrow">ENGINE OUTPUT</div><h3>Principal variations</h3></div><span>{topLine ? `DEPTH ${topLine.depth}` : 'WAITING'}</span></div>
              {lines.length ? lines.map((line) => <div className="pv-row" key={line.multipv}><b className="pv-rank" style={{ background: arrowColor(line.multipv) }} title={`Panah ${ARROW_NAMES[line.multipv - 1] ?? ''} di papan`}>{line.multipv}</b><strong>{formatScore(whiteScore(line, turn))}</strong><span title={formatVariation(position, line.pv)}>{formatVariation(position, line.pv.slice(0, 12)) || 'Waiting for principal variation…'}</span></div>) : <div className="pv-empty"><ChevronDown size={15} /><span>{engine.isAnalyzing ? 'Stockfish sedang mencari kandidat langkah…' : 'Menunggu analisis posisi terbaru…'}</span></div>}
            </section>
            <section className="engine-card">
              <div className="engine-card-heading"><div><div className="eyebrow">ENGINE CONTROL</div><h2><Cpu size={17} /> Stockfish <span>WASM</span></h2></div><span className={`engine-pill ${engine.ready ? 'online' : ''}`}><i />{engine.ready ? 'READY' : 'LOADING'}</span></div>
              <div className="engine-controls">
                <label>SEARCH MODE<select value={engine.settings.continuous ? 'continuous' : 'depth'} onChange={(e) => engine.setSettings((s) => ({ ...s, continuous: e.target.value === 'continuous' }))}><option value="continuous">Continuous — stop manually</option><option value="depth">Fixed depth</option></select></label>
                <label className={engine.settings.continuous ? 'setting-muted' : ''}>SEARCH DEPTH <strong>{engine.settings.depth}</strong><input type="range" min="5" max="30" step="1" value={engine.settings.depth} disabled={engine.settings.continuous} onChange={(e) => engine.setSettings((s) => ({ ...s, depth: Number(e.target.value) }))} /></label>
                <div className="settings-row">
                  <label>HASH MEMORY<select value={engine.settings.hash} onChange={(e) => engine.setSettings((s) => ({ ...s, hash: Number(e.target.value) }))}><option value="32">32 MB</option><option value="64">64 MB</option><option value="128">128 MB</option><option value="256">256 MB</option><option value="512">512 MB</option></select></label>
                  <label>THREADS<select value={engine.settings.threads} onChange={(e) => engine.setSettings((s) => ({ ...s, threads: Number(e.target.value) }))}><option value="1">1</option><option value="2">2</option><option value="4">4</option><option value="8">8</option></select></label>
                </div>
                <label className="multipv-label">MULTIPV<select value={engine.settings.multiPv} onChange={(e) => engine.setSettings((s) => ({ ...s, multiPv: Number(e.target.value) }))}><option value="1">1 line</option><option value="2">2 lines</option><option value="3">3 lines</option><option value="4">4 lines</option><option value="5">5 lines</option></select></label>
              </div>
              <div className="engine-actions"><button className="analyze-button" disabled={!engine.ready || engine.isAnalyzing} onClick={() => engine.analyze(fen)}><Play size={15} fill="currentColor" /> Start analysis</button><button className="stop-button" disabled={!engine.isAnalyzing} onClick={engine.stop}><StopIcon size={15} /> Stop</button></div>
              {engine.error && <p className="engine-error">{engine.error}</p>}
              <p className="engine-note"><Check size={12} /> Auto-analysis aktif: setiap langkah memperbarui rekomendasi untuk pemain yang mendapat giliran. {engine.settings.continuous ? 'Tekan Stop untuk menghentikan pencarian.' : `Pencarian berhenti otomatis pada depth ${engine.settings.depth}.`} MultiPV menampilkan beberapa kandidat.</p>
            </section>
            <section className="game-card">
              <div className="eyebrow">POSITION &amp; GAME</div>
              <h3>FEN, PGN &amp; files</h3>
              <label className="field-label" htmlFor="fen-current">CURRENT FEN</label>
              <div className="field-row"><input id="fen-current" className="text-field mono" readOnly value={fen} onFocus={(event) => event.currentTarget.select()} /><button className="mini-button" onClick={() => void copyText(fen, 'FEN')} aria-label="Copy FEN" title="Copy FEN"><Copy size={15} /></button></div>
              <label className="field-label" htmlFor="fen-load">LOAD FEN</label>
              <div className="field-row"><input id="fen-load" className="text-field mono" placeholder="Tempel FEN di sini" value={fenInput} onChange={(event) => setFenInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') loadFen() }} spellCheck={false} /><button className="mini-button text" onClick={loadFen} disabled={!fenInput.trim()}>Load</button></div>
              <label className="field-label" htmlFor="pgn-text">PGN</label>
              <textarea id="pgn-text" className="text-field mono" rows={5} placeholder="Tempel PGN di sini, atau tekan Export untuk mengambil PGN permainan saat ini" value={pgnText} onChange={(event) => setPgnText(event.target.value)} spellCheck={false} />
              <div className="game-actions">
                <button className="mini-button text" onClick={() => loadPgn()} disabled={!pgnText.trim()}>Load PGN</button>
                <button className="mini-button text" onClick={exportPgn} disabled={!state.moves.length}><Copy size={14} /> Export</button>
                <button className="mini-button text" onClick={downloadPgn} disabled={!state.moves.length}><Download size={14} /> .pgn</button>
                <button className="mini-button text" onClick={() => fileInputRef.current?.click()}><FileUp size={14} /> Open</button>
                <input ref={fileInputRef} type="file" accept=".pgn,.txt,text/plain" hidden onChange={importFile} />
              </div>
            </section>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
