import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Chess, type Square } from 'chess.js'
import { ArrowRight, Check, Eye, Flame, Lightbulb, RotateCcw, SkipForward, Target } from 'lucide-react'
import { PlayBoard } from '../components/board/PlayBoard'
import { Panel } from '../components/ui/Panel'
import { useLibrary } from '../features/library/libraryStore'
import { useSettings } from '../features/settings/settingsStore'
import { PUZZLES } from '../features/training/puzzleData'
import { MISTAKE_ID_PREFIX, mistakeItems } from '../features/training/trainingItems'
import { LEVEL_LABELS, THEME_LABELS, isValidItem, judgeMove, pickNext, summarize, type TrainingItem, type TrainingTheme } from '../features/training/trainingModel'
import { markFailure, markSolved, useTrainingProgress } from '../features/training/trainingStore'
import { useIsMobile } from '../lib/useIsMobile'

type Mode = 'puzzle' | 'mistake'
type Phase = 'playing' | 'solved' | 'revealed'
type Feedback = { kind: 'ok' | 'error' | 'info'; text: string } | null

const PUZZLE_THEMES: Array<TrainingTheme | 'all'> = ['all', 'mate1', 'mate2', 'mate3', 'material']
const REPLY_DELAY_MS = 550

const PUZZLE_ITEMS = PUZZLES.filter(isValidItem)

function splitUci(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] }
}

/** SAN of a UCI line from `fen`, stopping at the first move that cannot be replayed. */
function lineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of uciMoves) {
    try {
      const move = chess.move(splitUci(uci))
      if (!move) break
      out.push(move.san)
    } catch {
      break
    }
  }
  return out
}

export function TrainingPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const library = useLibrary()
  const progress = useTrainingProgress()
  // Deep link from the Dashboard ("Continue learning"): /training?item=<id> opens that exercise.
  // An id that no longer exists simply falls back to the normal "next exercise" choice.
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get('item')
  const [mode, setMode] = useState<Mode>(() => (requestedId?.startsWith(MISTAKE_ID_PREFIX) ? 'mistake' : 'puzzle'))
  const [theme, setTheme] = useState<TrainingTheme | 'all'>('all')
  const [currentId, setCurrentId] = useState<string | null>(requestedId)

  const mistakes = useMemo(() => mistakeItems(library.games, settings.playerName).filter(isValidItem), [library.games, settings.playerName])
  const allItems = useMemo(() => [...PUZZLE_ITEMS, ...mistakes], [mistakes])
  const pool = mode === 'puzzle' ? PUZZLE_ITEMS : mistakes
  const summary = useMemo(() => summarize(allItems, progress, Date.now()), [allItems, progress])

  const item: TrainingItem | null = useMemo(() => {
    const chosen = pool.find((entry) => entry.id === currentId && (mode === 'mistake' || theme === 'all' || entry.theme === theme))
    return chosen ?? pickNext(pool, progress, { theme: mode === 'puzzle' ? theme : 'all' })
    // `progress` is deliberately omitted: the item must not jump away when it gets solved.
  }, [pool, currentId, mode, theme])

  const [fen, setFen] = useState(() => item?.fen ?? '')
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('playing')
  const [selected, setSelected] = useState<Square | null>(null)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [assisted, setAssisted] = useState(false)
  const [shake, setShake] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  // Reset the board whenever a different item is shown.
  const itemId = item?.id ?? null
  useEffect(() => {
    clearTimers()
    setFen(item?.fen ?? '')
    setStep(0)
    setPhase('playing')
    setSelected(null)
    setLastMove(null)
    setHintLevel(0)
    setAssisted(false)
    setShake(false)
    setBusy(false)
    setFeedback(null)
  }, [itemId])

  const solverColor = item ? (item.fen.split(' ')[1] === 'b' ? 'b' : 'w') : 'w'
  const flipped = solverColor === 'b'
  const expected = item?.solution[step * 2] ?? null
  const position = useMemo(() => (fen ? new Chess(fen) : null), [fen])
  const targets = useMemo(() => (selected && position ? position.moves({ square: selected, verbose: true }).map((move) => move.to) : []), [selected, position])
  const hintSquare = hintLevel >= 1 && expected && phase === 'playing' ? splitUci(expected).from : null
  const totalSolverMoves = item ? Math.ceil(item.solution.length / 2) : 0

  function showNext() {
    const next = pickNext(pool, progress, { theme: mode === 'puzzle' ? theme : 'all', excludeId: item?.id })
    setCurrentId(next?.id ?? null)
  }

  function onSquare(square: Square) {
    if (!item || !position || phase !== 'playing' || busy) return
    if (selected && selected !== square) {
      const candidates = position.moves({ square: selected, verbose: true }).filter((move) => move.to === square)
      if (candidates.length) {
        play(selected, square, candidates.some((move) => move.promotion))
        return
      }
    }
    const piece = position.get(square)
    setSelected(piece && piece.color === position.turn() && selected !== square ? square : null)
  }

  function play(from: Square, to: Square, promotes: boolean) {
    if (!item || !position) return
    // A promotion move is judged with the solution's piece when it is the same pawn move, otherwise a queen.
    let promotion: string | undefined
    if (promotes) {
      const wanted = expected && expected.slice(0, 4) === `${from}${to}` ? expected[4] : undefined
      promotion = wanted ?? 'q'
    }
    const trial = new Chess(position.fen())
    let moved
    try {
      moved = trial.move({ from, to, promotion })
    } catch {
      moved = null
    }
    if (!moved) {
      setSelected(null)
      return
    }
    const uci = `${from}${to}${promotion ?? ''}`
    const judgement = judgeMove(item, step, uci, { givesMate: trial.isCheckmate() })
    setSelected(null)

    if (!judgement.correct) {
      markFailure(item.id)
      setAssisted(true)
      setShake(true)
      timers.current.push(window.setTimeout(() => setShake(false), 450))
      setFeedback({ kind: 'error', text: item.kind === 'mistake' ? 'Bukan pilihan engine. Coba cari langkah lain, atau minta petunjuk.' : 'Bukan langkah itu — coba lagi.' })
      return
    }

    setFen(trial.fen())
    setLastMove({ from, to })
    setHintLevel(0)
    if (judgement.done) {
      markSolved(item.id, assisted)
      setPhase('solved')
      setFeedback({ kind: 'ok', text: assisted ? 'Benar! Selesai (dengan bantuan atau percobaan ulang).' : 'Benar! Selesai tanpa bantuan.' })
      return
    }
    setFeedback({ kind: 'ok', text: 'Benar — lawan membalas…' })
    setBusy(true)
    const replyUci = judgement.reply
    timers.current.push(
      window.setTimeout(() => {
        if (!replyUci) return
        const after = new Chess(trial.fen())
        try {
          after.move(splitUci(replyUci))
        } catch {
          setBusy(false)
          return
        }
        setFen(after.fen())
        setLastMove({ from: splitUci(replyUci).from, to: splitUci(replyUci).to })
        setStep((value) => value + 1)
        setBusy(false)
        setFeedback({ kind: 'info', text: 'Lanjutkan: temukan langkah berikutnya.' })
      }, REPLY_DELAY_MS),
    )
  }

  function hint() {
    if (!item || phase !== 'playing') return
    setAssisted(true)
    setHintLevel((value) => Math.min(2, value + 1))
    setFeedback({ kind: 'info', text: hintLevel === 0 ? 'Petunjuk: bidak yang bersinar adalah yang harus digerakkan.' : `Petunjuk: bidak itu ke ${splitUci(item.solution[step * 2]).to}.` })
  }

  function reveal() {
    if (!item || phase !== 'playing') return
    clearTimers()
    markFailure(item.id)
    const remaining = item.solution.slice(step * 2)
    const san = lineToSan(fen, remaining)
    setPhase('revealed')
    setBusy(false)
    setFeedback({ kind: 'info', text: `Jawaban: ${san.join(' ')}` })
    const first = splitUci(remaining[0])
    const board = new Chess(fen)
    try {
      board.move(first)
      setFen(board.fen())
      setLastMove({ from: first.from, to: first.to })
    } catch {
      // keep the position as is
    }
  }

  function retry() {
    if (!item) return
    clearTimers()
    setFen(item.fen)
    setStep(0)
    setPhase('playing')
    setSelected(null)
    setLastMove(null)
    setHintLevel(0)
    setAssisted(true)
    setBusy(false)
    setFeedback(null)
  }

  const solutionSan = useMemo(() => (item && phase === 'solved' ? lineToSan(item.fen, item.solution).join(' ') : ''), [item, phase])

  return (
    <div className="page analysis-page training-page">
      <div className="analysis-heading">
        <div>
          <div className="eyebrow">CHESS UNLIMITED / IMPROVE</div>
          <h1>Training <span>Center</span></h1>
          <p>Puzzle taktik yang sudah diverifikasi Stockfish, plus latihan dari kesalahanmu sendiri.</p>
        </div>
        <div className="engine-status"><i className={summary.today > 0 ? 'status-ready' : ''} />{summary.today > 0 ? `${summary.today} selesai hari ini` : 'Belum berlatih hari ini'}</div>
      </div>

      <div className="stats-grid training-stats">
        <Panel className="stat-card"><div className="stat-icon"><Target size={17} /></div><div className="stat-label">SOLVED</div><div className="stat-value">{summary.solved} <small>/ {summary.total}</small></div><div className="stat-note">{summary.cleanRate === null ? 'Selesaikan puzzle pertamamu' : `${Math.round(summary.cleanRate * 100)}% tanpa bantuan`}</div></Panel>
        <Panel className="stat-card"><div className="stat-icon"><Flame size={17} /></div><div className="stat-label">STREAK</div><div className="stat-value">{summary.streak} <small>hari</small></div><div className="stat-note">{summary.streak > 0 ? 'Pertahankan ritmenya' : 'Selesaikan satu puzzle untuk memulai'}</div></Panel>
        <Panel className="stat-card"><div className="stat-icon"><Check size={17} /></div><div className="stat-label">HARI INI</div><div className="stat-value">{summary.today}</div><div className="stat-note">Puzzle selesai hari ini</div></Panel>
      </div>

      <div className="mode-tabs" role="tablist" aria-label="Jenis latihan">
        <button role="tab" aria-selected={mode === 'puzzle'} className={`mode-tab${mode === 'puzzle' ? ' active' : ''}`} onClick={() => { setMode('puzzle'); setCurrentId(null) }}>Puzzle taktik <b>{PUZZLE_ITEMS.length}</b></button>
        <button role="tab" aria-selected={mode === 'mistake'} className={`mode-tab${mode === 'mistake' ? ' active' : ''}`} onClick={() => { setMode('mistake'); setCurrentId(null) }}>Dari kesalahanmu <b>{mistakes.length}</b></button>
      </div>

      {!item ? (
        <section className="review-card empty-state">
          <div className="eyebrow">{mode === 'mistake' ? 'BELUM ADA KESALAHAN TERSIMPAN' : 'TIDAK ADA PUZZLE'}</div>
          {mode === 'mistake' ? (
            <>
              <h3>Latihan dari permainanmu sendiri</h3>
              <p className="engine-note">Jalankan Game Review pada permainanmu dan simpan ke Library. Langkah yang ditandai mistake atau blunder akan muncul di sini sebagai latihan. Pastikan namamu di Settings sama dengan nama di PGN agar hanya kesalahanmu yang dipakai.</p>
              <div className="game-actions"><Link to="/review" className="mini-button text">Buka Game Review <ArrowRight size={14} /></Link><Link to="/library" className="mini-button text">Library</Link></div>
            </>
          ) : (
            <p className="engine-note">Tidak ada puzzle untuk tema ini.</p>
          )}
        </section>
      ) : (
        <div className="analysis-layout">
          <section className="board-column">
            <div className="board-toolbar">
              <span>{THEME_LABELS[item.theme].toUpperCase()} <b>·</b> {LEVEL_LABELS[item.level].toUpperCase()}</span>
              <span>{phase === 'playing' ? `LANGKAH ${Math.min(step + 1, totalSolverMoves)} / ${totalSolverMoves}` : phase === 'solved' ? 'SELESAI' : 'JAWABAN'}</span>
            </div>
            <div className="board-frame training-frame">
              <PlayBoard fen={fen} flipped={flipped} theme={settings.boardTheme} pieceStyle={settings.pieceStyle} turn={position?.turn()} selected={selected} targets={targets} lastMove={lastMove} hint={hintSquare} shake={shake} textPresentation={isMobile} disabled={phase !== 'playing' || busy} label="Training board" onSquare={onSquare} />
            </div>
            <div className="board-footer"><span>{solverColor === 'w' ? 'PUTIH BERJALAN' : 'HITAM BERJALAN'}</span><span>{item.kind === 'mistake' ? 'DARI PERMAINANMU' : item.id.toUpperCase()}</span></div>
            {feedback && <p className={`game-notice ${feedback.kind === 'error' ? 'error' : 'ok'} training-feedback`} role="status" aria-live="polite">{feedback.text}</p>}
            {solutionSan && <p className="engine-note">Solusi: {solutionSan}</p>}
            <div className="training-actions">
              <button className="mini-button text" onClick={hint} disabled={phase !== 'playing' || busy}><Lightbulb size={14} /> Petunjuk</button>
              <button className="mini-button text" onClick={reveal} disabled={phase !== 'playing' || busy}><Eye size={14} /> Lihat jawaban</button>
              <button className="mini-button text" onClick={retry} disabled={phase === 'playing' && step === 0 && !lastMove}><RotateCcw size={14} /> Ulangi</button>
              <button className="analyze-button" onClick={showNext}>{phase === 'playing' ? <><SkipForward size={15} /> Lewati</> : <>Berikutnya <ArrowRight size={15} /></>}</button>
            </div>
          </section>

          <aside className="engine-column">
            <section className="review-card">
              <div className="eyebrow">{item.kind === 'mistake' ? 'LATIHAN DARI KESALAHAN' : 'PUZZLE'}</div>
              <h3>{item.kind === 'mistake' ? item.title : THEME_LABELS[item.theme]}</h3>
              <p className="current-text">{item.kind === 'mistake' ? item.note : /^mate\d$/.test(item.theme) ? 'Temukan rangkaian langkah yang memaksa skakmat. Langkah lawan dimainkan otomatis.' : 'Temukan satu langkah terbaik yang membuat kamu unggul materi. Engine menilai langkah lain jauh lebih lemah.'}</p>
              <p className="current-sub">Tingkat: {LEVEL_LABELS[item.level]} · {totalSolverMoves} langkah milikmu</p>
            </section>

            {mode === 'puzzle' && (
              <section className="review-card">
                <div className="eyebrow">TEMA</div>
                <div className="chip-row" role="group" aria-label="Filter tema">
                  {PUZZLE_THEMES.map((value) => {
                    const stat = value === 'all' ? { solved: summary.byTheme.mate1.solved + summary.byTheme.mate2.solved + summary.byTheme.mate3.solved + summary.byTheme.material.solved, total: PUZZLE_ITEMS.length } : summary.byTheme[value]
                    return (
                      <button key={value} className={`chip${theme === value ? ' active' : ''}`} aria-pressed={theme === value} onClick={() => { setTheme(value); setCurrentId(null) }}>
                        {value === 'all' ? 'Semua' : THEME_LABELS[value]} <b>{stat.solved}/{stat.total}</b>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            <section className="review-card">
              <div className="eyebrow">CARA KERJA</div>
              <p className="engine-note">Puzzle dibuat dari permainan Stockfish melawan dirinya sendiri, lalu diperiksa ulang pada depth 18: untuk skakmat, setiap langkahmu harus mempertahankan skakmat tercepat; untuk materi, langkah pertama harus unggul jauh dari alternatifnya. Jika ada beberapa cara skakmat di langkah terakhir, semuanya diterima.</p>
              <button className="mini-button text" onClick={() => navigate('/library')}>Buka Library</button>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
