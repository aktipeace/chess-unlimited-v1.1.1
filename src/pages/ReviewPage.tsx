import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownUp, BookOpen, Maximize2, Minimize2, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileUp, Play, Save, Square as StopIcon } from 'lucide-react'
import type { Square } from 'chess.js'
import { StaticBoard, type BoardArrow } from '../components/board/StaticBoard'
import { START_FEN, fromPgn, goTo, moveRows, type GameState } from '../features/analysis/gameModel'
import { EvalGraph } from '../features/review/EvalGraph'
import { libraryStore, saveGameToLibrary } from '../features/library/libraryStore'
import { storedToPositions } from '../features/library/libraryModel'
import { bookDepth, detectOpening, uciMovesOf } from '../features/openings/openingModel'
import { clearPendingGame, peekPendingGame, peekPendingSavedId, setPendingGame } from '../features/review/pendingGame'
import { useSettings } from '../features/settings/settingsStore'
import { CLASSIFICATIONS, CLASSIFICATION_COLORS, CLASSIFICATION_HINTS, CLASSIFICATION_LABELS, CLASSIFICATION_SYMBOLS, GOOD_CLASSIFICATIONS, buildReview, formatEval, timelineOf, winPercent, type PositionEval, type ReviewResult } from '../features/review/reviewModel'
import { SAMPLE_PGN } from '../features/review/samplePgn'
import { useGameReview } from '../features/review/useGameReview'
import { isMobileViewport, useIsMobile } from '../lib/useIsMobile'
import { useBoardAnnotations } from '../components/board/useBoardAnnotations'
import { useBoardFocus } from '../components/board/useBoardFocus'

const DEPTH_OPTIONS = [
  { value: 10, label: '10 — cepat' },
  { value: 12, label: '12 — ringan (HP)' },
  { value: 14, label: '14 — seimbang' },
  { value: 16, label: '16 — teliti' },
  { value: 18, label: '18 — sangat teliti' },
]

const STATUS_LABELS = {
  idle: 'Siap',
  starting: 'Memuat engine…',
  running: 'Menganalisis…',
  done: 'Review selesai',
  cancelled: 'Dibatalkan',
  error: 'Engine bermasalah',
} as const

function moveLabel(source: GameState, ply: number, san: string, color: 'w' | 'b') {
  const parts = source.startFen.split(' ')
  const offset = parts[1] === 'b' ? 1 : 0
  const startNumber = Number(parts[5]) || 1
  const number = startNumber + Math.floor((ply - 1 + offset) / 2)
  return `${number}${color === 'w' ? '.' : '...'} ${san}`
}

const SHOWN_SYMBOLS = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']

export function ReviewPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const [savedId] = useState(() => peekPendingSavedId())
  const [source, setSource] = useState<GameState | null>(() => peekPendingGame())
  const [ply, setPly] = useState(() => peekPendingGame()?.cursor ?? 0)
  const [pgnText, setPgnText] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [depth, setDepth] = useState(() => (isMobileViewport() ? Math.min(12, settings.reviewDepth) : settings.reviewDepth))
  const startedDepth = useRef(depth)
  const handledResult = useRef<ReviewResult | null>(null)
  const [flipped, setFlipped] = useState(false)
  const review = useGameReview()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const moveListRef = useRef<HTMLOListElement | null>(null)
  const boardColumnRef = useRef<HTMLElement | null>(null)
  const annotations = useBoardAnnotations()
  const boardFocus = useBoardFocus()

  // The hand-off slot was read while rendering; free it once the page is mounted.
  useEffect(() => {
    clearPendingGame()
  }, [])

  // Opened from the Library with a saved review: show it instead of running the engine again.
  useEffect(() => {
    if (!savedId || !source) return
    const game = libraryStore.get().games.find((item) => item.id === savedId)
    if (!game?.review) return
    try {
      const restored = buildReview(source, storedToPositions(game.review))
      handledResult.current = restored
      startedDepth.current = game.review.depth
      review.restore(restored)
      if (DEPTH_OPTIONS.some((option) => option.value === game.review?.depth)) setDepth(game.review.depth)
      setNotice({ kind: 'ok', text: `Review dimuat dari Library (depth ${game.review.depth}). Tekan "Review ulang" untuk menganalisis lagi.` })
    } catch {
      setNotice({ kind: 'error', text: 'Review tersimpan tidak cocok dengan permainan ini; jalankan review baru.' })
    }
    // Runs once on mount: the hand-off data was captured during the first render.
  }, [])


  const total = source?.moves.length ?? 0
  const fens = useMemo(() => (source ? timelineOf(source).fens : [START_FEN]), [source])
  const rows = useMemo(() => (source ? moveRows(source) : []), [source])
  const fen = fens[Math.min(ply, fens.length - 1)]
  const uciLine = useMemo(() => (source ? uciMovesOf(source.moves) : []), [source])
  const opening = useMemo(() => (source && source.startFen === START_FEN ? detectOpening(uciLine) : null), [source, uciLine])
  const leftBookAt = useMemo(() => (source && source.startFen === START_FEN ? bookDepth(uciLine) : 0), [source, uciLine])

  // A finished review is saved to the Library automatically (unless switched off in Settings).
  useEffect(() => {
    const finished = review.result
    if (!finished || !source || handledResult.current === finished) return
    handledResult.current = finished
    if (!settings.autoSaveReviews) return
    const outcome = saveGameToLibrary(source, { review: { result: finished, depth: startedDepth.current, fens } })
    setNotice(outcome.ok ? { kind: 'ok', text: 'Review selesai dan disimpan ke Library.' } : { kind: 'error', text: 'Review selesai, tetapi browser menolak menyimpannya (penyimpanan penuh atau diblokir).' })
  }, [review.result, source, fens, settings.autoSaveReviews])

  const busy = review.status === 'starting' || review.status === 'running'
  const result = review.result
  const positions: PositionEval[] = result ? result.positions : review.partial
  const reviews = result?.moves ?? null
  const current = ply > 0 && reviews ? reviews[ply - 1] : null
  const currentEval: PositionEval | undefined = positions[ply]
  const lastMove = source && ply > 0 ? source.moves[ply - 1] : null
  const bestUci = currentEval?.best ?? null
  const isSquarePair = (uci: string | null | undefined): uci is string => Boolean(uci && /^[a-h][1-8][a-h][1-8]/.test(uci))
  const arrows: BoardArrow[] = []
  if (settings.showBestArrow) {
    if (current && lastMove) {
      // Where the better move was (green), then the move that was actually played (its quality colour).
      if (!GOOD_CLASSIFICATIONS.includes(current.classification) && isSquarePair(current.bestUci)) {
        arrows.push({ from: current.bestUci.slice(0, 2) as Square, to: current.bestUci.slice(2, 4) as Square, color: '#a8e063' })
      }
      arrows.push({ from: lastMove.from, to: lastMove.to, color: CLASSIFICATION_COLORS[current.classification], played: true })
    } else if (isSquarePair(bestUci)) {
      arrows.push({ from: bestUci.slice(0, 2) as Square, to: bestUci.slice(2, 4) as Square, color: '#a8e063' })
    }
  }
  const badge = current && lastMove ? { square: lastMove.to, symbol: CLASSIFICATION_SYMBOLS[current.classification], color: CLASSIFICATION_COLORS[current.classification], label: CLASSIFICATION_LABELS[current.classification] } : null
  const whitePercent = currentEval ? winPercent(currentEval.cp) : 50
  const blackPercent = 100 - whitePercent
  const progressPercent = review.progress.total ? Math.round((review.progress.done / review.progress.total) * 100) : 0

  // Keyboard: ← → Home End, like the Analysis Studio.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const move = (change: (value: number) => number) => {
        event.preventDefault()
        setPly((value) => Math.max(0, Math.min(total, change(value))))
      }
      if (event.key === 'ArrowLeft') move((value) => value - 1)
      else if (event.key === 'ArrowRight') move((value) => value + 1)
      else if (event.key === 'Home') move(() => 0)
      else if (event.key === 'End') move(() => total)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [total])

  // Keep the active move visible inside the move list without scrolling the whole page.
  useEffect(() => {
    const list = moveListRef.current
    const chip = list?.querySelector<HTMLElement>('.move-chip.active')
    if (!list || !chip) return
    if (chip.offsetTop < list.scrollTop) list.scrollTop = chip.offsetTop
    else if (chip.offsetTop + chip.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = chip.offsetTop + chip.offsetHeight - list.clientHeight
    if (chip.offsetLeft < list.scrollLeft) list.scrollLeft = Math.max(0, chip.offsetLeft - 8)
    else if (chip.offsetLeft + chip.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = chip.offsetLeft + chip.offsetWidth - list.clientWidth + 8
  }, [ply, total])

  function loadPgn(text: string = pgnText) {
    const next = fromPgn(text)
    if (!next) {
      setNotice({ kind: 'error', text: 'PGN tidak valid atau tidak berisi langkah.' })
      return
    }
    review.reset()
    setSource(next)
    setPly(0)
    setNotice({ kind: 'ok', text: `PGN dimuat: ${next.moves.length} langkah. Tekan "Start review" untuk menganalisis.` })
  }

  function loadSample() {
    setPgnText(SAMPLE_PGN)
    loadPgn(SAMPLE_PGN)
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

  function startReview() {
    if (!source || !source.moves.length) return
    setNotice(null)
    startedDepth.current = depth
    void review.start(source, depth)
  }

  function saveToLibrary() {
    if (!source) return
    const outcome = saveGameToLibrary(source, review.result ? { review: { result: review.result, depth: startedDepth.current, fens } } : {})
    setNotice(outcome.ok ? { kind: 'ok', text: outcome.created ? 'Permainan disimpan ke Library.' : 'Permainan di Library diperbarui.' } : { kind: 'error', text: 'Browser menolak menyimpan data (penyimpanan penuh atau diblokir).' })
  }

  function openInAnalysis() {
    if (!source) return
    setPendingGame(goTo(source, ply))
    navigate('/analysis')
  }

  const renderChip = (entry: { san: string; ply: number }) => {
    const classification = reviews?.[entry.ply - 1]?.classification
    return (
      <button
        className={`move-chip${ply === entry.ply ? ' active' : ''}`}
        aria-current={ply === entry.ply ? 'step' : undefined}
        title={classification ? CLASSIFICATION_LABELS[classification] : undefined}
        onClick={() => setPly(entry.ply)}
      >
        {classification && <i className={`qdot q-${classification}`} />}
        {entry.san}
        {classification && SHOWN_SYMBOLS.includes(classification) && <sup className={`qsym q-${classification}`}>{CLASSIFICATION_SYMBOLS[classification]}</sup>}
      </button>
    )
  }

  return (
    <div className="page analysis-page studio-page review-page">
      <div className="analysis-heading">
        <div>
          <div className="eyebrow">CHESS UNLIMITED / ENGINE WORKSPACE</div>
          <h1>Game <span>Review</span></h1>
          <p>Telusuri titik balik permainan: Stockfish menilai setiap langkah, lalu menghitung akurasi kedua pemain.</p>
        </div>
        <div className="engine-status"><i className={review.status === 'done' ? 'status-ready' : ''} />{STATUS_LABELS[review.status]}</div>
      </div>

      <div className="analysis-layout">
        <section ref={boardColumnRef} className={`board-column${boardFocus.focused ? ' board-focus-mode' : ''}`}>
          <div className="board-toolbar">
            <span>REVIEW BOARD <b>·</b> {source ? `${total} PLY` : 'NO GAME'}</span>
            <div className="board-toolbar-actions"><button onClick={() => setFlipped((value) => !value)} title="Flip board" aria-label="Flip board"><ArrowDownUp size={15} /></button><button onClick={annotations.clearArrows} title="Hapus semua panah" aria-label="Hapus semua panah" disabled={!annotations.arrows.length}><Trash2 size={15} /></button><button onClick={() => void boardFocus.toggle(boardColumnRef.current)} title={boardFocus.focused ? "Keluar fokus papan" : "Fokus papan"} aria-label={boardFocus.focused ? "Keluar fokus papan" : "Fokus papan"}>{boardFocus.focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div>
          </div>
          <div className="board-frame">
            <div className="eval-rail"><div className="eval-black" style={{ height: `${blackPercent}%`, ...(flipped ? { top: 'auto', bottom: 0 } : {}) }} /><div className="eval-white" /><span>{formatEval(currentEval)}</span></div>
            <StaticBoard fen={fen} flipped={flipped} theme={settings.boardTheme} pieceStyle={settings.pieceStyle} lastMove={lastMove} arrows={[...arrows, ...annotations.arrows]} badge={badge} textPresentation={isMobile} onPointerDown={annotations.onPointerDown} onContextMenu={annotations.onContextMenu} />
          </div>
          <div className="board-footer"><span>{ply === 0 ? 'START' : `AFTER PLY ${ply}`}</span><span>{currentEval ? `EVAL ${formatEval(currentEval)}` : 'NOT EVALUATED'}</span><span>{ply} / {total} PLY</span></div>
          <div className="board-nav" role="group" aria-label="Move navigation">
            <button onClick={() => setPly(0)} disabled={ply === 0} aria-label="First position" title="First (Home)"><ChevronsLeft size={18} /></button>
            <button onClick={() => setPly((value) => Math.max(0, value - 1))} disabled={ply === 0} aria-label="Previous move" title="Previous (←)"><ChevronLeft size={18} /></button>
            <button onClick={() => setPly((value) => Math.min(total, value + 1))} disabled={ply >= total} aria-label="Next move" title="Next (→)"><ChevronRight size={18} /></button>
            <button onClick={() => setPly(total)} disabled={ply >= total} aria-label="Last position" title="Last (End)"><ChevronsRight size={18} /></button>
          </div>

        </section>

        <aside className="engine-column">
          <div className="side-grid">
            <div className="side-col side-col-a">
            {current && source && (
              <section className="review-card current-move" aria-live="polite">
                <div className="current-head">
                  <span className={`q-badge q-${current.classification}`}>{CLASSIFICATION_SYMBOLS[current.classification]} {CLASSIFICATION_LABELS[current.classification]}</span>
                  <strong>{moveLabel(source, current.ply, current.san, current.color)}</strong>
                </div>
                <p className="current-text">
                  {CLASSIFICATION_HINTS[current.classification]}
                  {!GOOD_CLASSIFICATIONS.includes(current.classification) && current.bestSan && <> Seharusnya <strong>{current.bestSan}</strong> (panah hijau).</>}
                </p>
                <p className="current-sub">Akurasi langkah {current.accuracy.toFixed(0)}% · peluang menang −{current.winLoss.toFixed(1)}% · evaluasi {formatEval(currentEval)}</p>
              </section>
            )}

            <section className="moves-card">
              <div className="moves-heading"><div className="eyebrow">MOVE LIST</div><span>{total} PLY</span></div>
              {rows.length ? (
                <ol className="move-list" ref={moveListRef}>
                  {rows.map((row) => (
                    <li className="move-row" key={row.number}>
                      <span className="move-number">{row.number}.</span>
                      {row.white ? renderChip(row.white) : <span className="move-chip empty">…</span>}
                      {row.black && renderChip(row.black)}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="pv-empty"><span>Belum ada permainan — tempel PGN, buka file, atau coba contoh.</span></div>
              )}
            </section>
            {source && positions.length > 0 && (
              <section className="review-card graph-card">
                <div className="moves-heading"><div className="eyebrow">EVALUATION GRAPH</div><span>WHITE vs BLACK</span></div>
                <EvalGraph values={positions.map((entry) => entry.cp)} plies={total} cursor={ply} onSelect={setPly} />
              </section>
            )}

            {opening && (
              <section className="review-card opening-line" aria-label="Pembukaan">
                <div className="moves-heading"><div className="eyebrow"><BookOpen size={12} /> PEMBUKAAN</div><span>{opening.eco}</span></div>
                <strong>{opening.name}</strong>
                <p className="current-sub">{ply === 0 ? 'Posisi awal.' : ply <= leftBookAt ? 'Posisi ini masih ada di buku pembukaan.' : `Keluar dari buku pembukaan setelah langkah ke-${leftBookAt}.`}</p>
              </section>
            )}

              <section className="review-card legend-card" aria-label="Keterangan papan">
                <div className="eyebrow">KETERANGAN PAPAN</div>
                <ul className="legend-list" style={{ marginTop: 12 }}>
                  <li><i className="swatch arrow" style={{ background: '#a8e063', color: '#a8e063' }} /><span><b>Panah hijau</b> seharusnya melangkah ke sini (langkah terbaik)</span></li>
                  <li><i className="swatch arrow" style={{ background: '#f09a4a', color: '#f09a4a' }} /><span><b>Panah tebal berwarna</b> langkah yang dimainkan; warnanya = kualitas langkah</span></li>
                  <li><i className="swatch" style={{ background: '#d9d36a' }} /><span><b>Kuning</b> langkah terakhir yang dimainkan</span></li>
                  {CLASSIFICATIONS.map((classification) => <li key={classification}><i className={`qdot q-${classification}`} /><span><b>{CLASSIFICATION_SYMBOLS[classification]} {CLASSIFICATION_LABELS[classification]}</b> {CLASSIFICATION_HINTS[classification]}</span></li>)}
                  <li><i className="swatch" style={{ background: '#e2e3dc' }} /><span><b>Bar terang</b> keunggulan Putih; <b>gelap</b> keunggulan Hitam</span></li>
                </ul>
              </section>
            </div>
            <div className="side-col side-col-b">
            {(busy || review.status === 'cancelled' || review.status === 'error') && (
              <section className="review-card engine-progress">
                <div className="eyebrow">ENGINE REVIEW</div>
                {busy ? (
                  <>
                    <div className="review-progress-head">
                      <strong>{review.status === 'starting' ? 'Memuat Stockfish…' : `Posisi ${review.progress.done} / ${review.progress.total}`}</strong>
                      <span>depth {depth}{review.singleThread ? ' · single-thread' : ''}</span>
                    </div>
                    <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><i style={{ width: `${progressPercent}%` }} /></div>
                    <button className="mini-button text" onClick={review.cancel}><StopIcon size={14} /> Cancel</button>
                  </>
                ) : (
                  <p className={`game-notice ${review.status === 'error' ? 'error' : 'ok'}`} role="status">
                    {review.status === 'error' ? review.error ?? 'Review gagal dijalankan.' : 'Review dibatalkan. Hasil parsial tetap bisa dilihat di grafik.'}
                  </p>
                )}
              </section>
            )}

            {result && (
              <section className="review-card review-summary">
                <div className="eyebrow">REVIEW SUMMARY</div>
                <div className="summary-grid">
                  {(['white', 'black'] as const).map((side) => {
                    const summary = result[side]
                    return (
                      <div key={side} className="summary-side">
                        <span className="summary-name">{side === 'white' ? 'WHITE' : 'BLACK'}</span>
                        <strong className="accuracy-value">{summary.accuracy === null ? '—' : summary.accuracy.toFixed(1)}<small>%</small></strong>
                        <span className="summary-sub">Accuracy · ACPL {summary.acpl === null ? '—' : Math.round(summary.acpl)}</span>
                      </div>
                    )
                  })}
                </div>
                <table className="count-table">
                  <thead><tr><th scope="col">Move quality</th><th scope="col">White</th><th scope="col">Black</th></tr></thead>
                  <tbody>
                    {CLASSIFICATIONS.map((classification) => (
                      <tr key={classification}>
                        <th scope="row"><i className={`qdot q-${classification}`} />{CLASSIFICATION_LABELS[classification]}</th>
                        <td>{result.white.counts[classification]}</td>
                        <td>{result.black.counts[classification]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {!busy && (
              <section className="review-card">
                <div className="eyebrow">GAME SOURCE</div>
                <h3>{source ? `${total} langkah dimuat` : 'Muat permainan'}</h3>
                <label className="field-label" htmlFor="review-pgn">PGN</label>
                <textarea id="review-pgn" className="text-field mono" rows={5} placeholder="Tempel PGN di sini" value={pgnText} onChange={(event) => setPgnText(event.target.value)} spellCheck={false} />
                <div className="game-actions">
                  <button className="mini-button text" onClick={() => loadPgn()} disabled={!pgnText.trim()}>Load PGN</button>
                  <button className="mini-button text" onClick={() => fileInputRef.current?.click()}><FileUp size={14} /> Open</button>
                  <button className="mini-button text" onClick={loadSample}>Contoh</button>
                  <input ref={fileInputRef} type="file" accept=".pgn,.txt,text/plain" hidden onChange={importFile} />
                </div>
                <label className="field-label" htmlFor="review-depth">ENGINE DEPTH</label>
                <select id="review-depth" className="text-field" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                  {DEPTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="review-run">
                  <button className="analyze-button" onClick={startReview} disabled={!source || total === 0}><Play size={15} fill="currentColor" /> {result ? 'Review ulang' : 'Start review'}</button>
                  {source && <button className="mini-button text" onClick={openInAnalysis}>Open in Analysis</button>}
                  {source && <button className="mini-button text" onClick={saveToLibrary}><Save size={14} /> Simpan</button>}
                </div>
                {source && <p className="engine-note">{total + 1} posisi akan dianalisis pada depth {depth}. Semakin tinggi depth, semakin lama prosesnya.</p>}
                {notice && <p className={`game-notice ${notice.kind}`} role="status">{notice.text}</p>}
              </section>
            )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
