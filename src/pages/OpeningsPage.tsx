import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chess, type Square } from 'chess.js'
import { ArrowDownUp, ArrowLeft, BookOpen, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { StaticBoard } from '../components/board/StaticBoard'
import { START_FEN, type GameState } from '../features/analysis/gameModel'
import { BOOK_SIZE, detectOpening, entryFor, formatLine, nextBookMoves, openingAt, sanPath, searchOpenings } from '../features/openings/openingModel'
import { setPendingGame } from '../features/review/pendingGame'
import { useSettings } from '../features/settings/settingsStore'
import { useIsMobile } from '../lib/useIsMobile'

/** Replays a UCI path from the start position. The path always comes from the book, so it is legal. */
function positionAfter(path: string[]) {
  const chess = new Chess()
  let last: { from: Square; to: Square } | null = null
  for (const uci of path) {
    const move = chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] })
    last = { from: move.from as Square, to: move.to as Square }
  }
  return { fen: chess.fen(), last }
}

export function OpeningsPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const [path, setPath] = useState<string[]>([])
  const [flipped, setFlipped] = useState(false)
  const [query, setQuery] = useState('')

  const { fen, last } = useMemo(() => positionAfter(path), [path])
  const san = useMemo(() => sanPath(path) ?? [], [path])
  const continuations = useMemo(() => nextBookMoves(path), [path])
  const exact = useMemo(() => openingAt(path), [path])
  const detected = useMemo(() => detectOpening(path), [path])
  const idea = useMemo(() => (detected ? entryFor(path.slice(0, detected.plies))?.idea : undefined), [path, detected])
  const results = useMemo(() => searchOpenings(query, 12), [query])
  const turn = fen.split(' ')[1] === 'w' ? 'Putih' : 'Hitam'

  function openInAnalysis() {
    if (!path.length) {
      navigate('/analysis')
      return
    }
    const state: GameState = {
      startFen: START_FEN,
      moves: path.map((uci, index) => ({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4], san: san[index] ?? uci })),
      cursor: path.length,
    }
    setPendingGame(state)
    navigate('/analysis')
  }

  return (
    <div className="page analysis-page openings-page">
      <div className="analysis-heading">
        <div>
          <div className="eyebrow">CHESS UNLIMITED / IMPROVE</div>
          <h1>Opening <span>Explorer</span></h1>
          <p>Jelajahi {BOOK_SIZE} jalur pembukaan populer dari data lokal — tanpa internet dan tanpa akun.</p>
        </div>
        <div className="engine-status"><i className="status-ready" />Buku pembukaan siap</div>
      </div>

      <div className="analysis-layout">
        <section className="board-column">
          <div className="board-toolbar">
            <span>OPENING BOARD <b>·</b> {path.length} PLY</span>
            <div className="board-toolbar-actions">
              <button onClick={() => setFlipped((value) => !value)} title="Flip board" aria-label="Flip board"><ArrowDownUp size={15} /></button>
              <button onClick={() => setPath((value) => value.slice(0, -1))} disabled={!path.length} title="Langkah sebelumnya" aria-label="Langkah sebelumnya"><ArrowLeft size={15} /></button>
              <button onClick={() => setPath([])} disabled={!path.length} title="Mulai dari awal" aria-label="Mulai dari awal"><RotateCcw size={15} /></button>
            </div>
          </div>
          <div className="board-frame openings-frame">
            <StaticBoard fen={fen} flipped={flipped} theme={settings.boardTheme} pieceStyle={settings.pieceStyle} lastMove={last} textPresentation={isMobile} label="Opening board" />
          </div>
          <div className="board-footer"><span>{turn.toUpperCase()} BERJALAN</span><span>{exact ? `${exact.eco} · ${exact.name}`.toUpperCase() : detected ? `${detected.eco}` : 'POSISI AWAL'}</span><span>{path.length} PLY</span></div>

          <section className="review-card opening-name-card" aria-live="polite">
            <div className="eyebrow">{path.length ? 'GARIS SAAT INI' : 'MULAI DARI POSISI AWAL'}</div>
            {detected ? <h3>{detected.name} <span className="eco-tag">{detected.eco}</span></h3> : <h3>Pilih langkah pertama</h3>}
            <p className="current-text mono-line">{path.length ? formatLine(san) : 'Belum ada langkah. Pilih salah satu langkah dari daftar di samping.'}</p>
            {idea && <p className="current-sub">Ide: {idea}</p>}
            {detected && !exact && <p className="current-sub">Posisi ini berada di antara jalur buku; nama di atas adalah jalur terdekat sebelumnya.</p>}
            <div className="game-actions"><button className="mini-button text" onClick={openInAnalysis}>Analisis posisi ini</button></div>
          </section>
        </section>

        <aside className="engine-column">
          <section className="review-card">
            <div className="eyebrow">LANGKAH DALAM BUKU</div>
            {continuations.length ? (
              <ul className="book-moves">
                {continuations.map((move) => (
                  <li key={move.uci}>
                    <button className="book-move" onClick={() => setPath((value) => [...value, move.uci])}>
                      <strong>{move.san}</strong>
                      <span>{move.named.length ? move.named.map((item) => item.name).slice(0, 2).join(' · ') : move.example.name}</span>
                      <small>{move.lines} jalur{move.named[0] ? ` · ${move.named[0].eco}` : ''}</small>
                      <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pv-empty"><BookOpen size={15} /><span>{path.length ? 'Ujung buku pembukaan. Teruskan di Analysis Studio untuk melihat saran engine.' : 'Buku kosong.'}</span></div>
            )}
          </section>

          <section className="review-card">
            <div className="eyebrow">CARI PEMBUKAAN</div>
            <label className="field-label" htmlFor="opening-search">NAMA ATAU KODE ECO</label>
            <div className="field-row">
              <input id="opening-search" className="text-field" placeholder="mis. Najdorf, Catalan, B90" value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} />
              <span className="mini-button" aria-hidden="true"><Search size={15} /></span>
            </div>
            {query.trim() && (results.length ? (
              <ul className="book-moves search-results">
                {results.map((entry) => (
                  <li key={entry.uci}>
                    <button className="book-move" onClick={() => { setPath(entry.uci.split(' ')); setQuery('') }}>
                      <strong>{entry.eco}</strong>
                      <span>{entry.name}</span>
                      <small>{entry.san.split(' ').length} ply</small>
                      <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="engine-note">Tidak ada pembukaan yang cocok.</p>)}
          </section>

          <section className="review-card">
            <div className="eyebrow">TENTANG DATA</div>
            <p className="engine-note">Setiap jalur diperiksa legalitasnya dan dinilai sehat oleh Stockfish (depth 12) saat data dibuat. Daftar ini kurasi pembukaan populer, bukan basis data lengkap, dan tidak memuat statistik hasil pertandingan.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
