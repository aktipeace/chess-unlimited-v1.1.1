import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Square } from 'chess.js'
import { ArrowDownUp, Bot, Flag, GraduationCap, Play, RotateCcw, Save, Undo2 } from 'lucide-react'
import { PlayBoard } from '../components/board/PlayBoard'
import { Piece } from '../components/board/Piece'
import { chessAt, gameStatus, moveRows, needsPromotion, newGame, tryMove, type GameState } from '../features/analysis/gameModel'
import { saveGameToLibrary } from '../features/library/libraryStore'
import { detectOpening, uciMovesOf } from '../features/openings/openingModel'
import { BotEngine } from '../features/play/botEngine'
import { MAX_BOT_RATING, MIN_BOT_RATING, botLevelLabel, botParams, pickBotMove, thinkTimeMs } from '../features/play/botModel'
import { setPendingGame } from '../features/review/pendingGame'
import { useSettings } from '../features/settings/settingsStore'
import { useIsMobile } from '../lib/useIsMobile'

type Phase = 'setup' | 'playing' | 'over'
type ColorChoice = 'w' | 'b' | 'random'

const PROMOTION_CHOICES = [
  { type: 'q', name: 'Ratu' },
  { type: 'r', name: 'Benteng' },
  { type: 'b', name: 'Gajah' },
  { type: 'n', name: 'Kuda' },
] as const

const LEVEL_HINT = (rating: number) =>
  rating < 900 ? 'Sering salah langkah dan melewatkan taktik sederhana. Cocok untuk pemula.'
  : rating < 1300 ? 'Bermain wajar tetapi masih sering lengah, seperti pemain santai.'
  : rating < 1700 ? 'Lawan klub: taktik dasar aman, tetapi kadang salah menilai posisi.'
  : rating < 2100 ? 'Jarang membuat kesalahan besar. Perlu rencana yang matang.'
  : 'Hampir selalu memilih langkah terbaik. Tantangan berat.'

const todayPgn = () => new Date().toISOString().slice(0, 10).replace(/-/g, '.')

export function PlayPage() {
  const settings = useSettings()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [phase, setPhase] = useState<Phase>('setup')
  const [colorChoice, setColorChoice] = useState<ColorChoice>('w')
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w')
  const [rating, setRating] = useState(1200)
  const [humanTime, setHumanTime] = useState(true)
  const [game, setGame] = useState<GameState>(() => newGame())
  const [selected, setSelected] = useState<Square | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [resigned, setResigned] = useState<'w' | 'b' | null>(null)
  const [manualFlip, setManualFlip] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const engineRef = useRef<BotEngine | null>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    const engine = new BotEngine()
    engineRef.current = engine
    engine.ready.catch((error: Error) => setEngineError(error.message))
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  const position = useMemo(() => chessAt(game), [game])
  const fen = position.fen()
  const turn = position.turn()
  const status = useMemo(() => gameStatus(position), [position])
  const finished = status.over || resigned !== null
  const flipped = (playerColor === 'b') !== manualFlip
  const lastMove = game.moves.length ? { from: game.moves[game.moves.length - 1].from, to: game.moves[game.moves.length - 1].to } : null
  const targets = useMemo(() => (selected ? position.moves({ square: selected, verbose: true }).map((move) => move.to) : []), [selected, position])
  const rows = useMemo(() => moveRows(game), [game])
  const opening = useMemo(() => (game.moves.length ? detectOpening(uciMovesOf(game.moves)) : null), [game.moves])
  const botName = `Bot ${rating}`
  const playerName = settings.playerName || 'Anda'
  const myTurn = phase === 'playing' && !thinking && turn === playerColor && !finished

  const result = resigned ? (resigned === 'w' ? '0-1' : '1-0') : status.result
  const outcome = !result ? null : result === '1/2-1/2' ? 'draw' : (result === '1-0') === (playerColor === 'w') ? 'win' : 'loss'

  // The bot's turn: ask Stockfish for candidates, choose like a human would, then wait a natural moment.
  useEffect(() => {
    if (phase !== 'playing' || finished || turn === playerColor) return
    const engine = engineRef.current
    if (!engine) return
    const token = ++tokenRef.current
    setThinking(true)
    const params = botParams(rating)
    const run = async () => {
      const started = performance.now()
      const candidates = await engine.analyze(fen, params.depth, params.multiPv)
      if (token !== tokenRef.current) return
      const uci = pickBotMove(candidates, params)
      if (!uci) {
        setThinking(false)
        setEngineError((current) => current ?? 'Bot tidak bisa memilih langkah. Muat ulang halaman jika engine tidak merespons.')
        return
      }
      const sorted = [...candidates].sort((a, b) => b.cp - a.cp)
      const spread = sorted.length > 1 ? sorted[0].cp - sorted[1].cp : 999
      const wanted = humanTime ? thinkTimeMs({ ply: game.moves.length, legalMoves: position.moves().length, spread }) : 120
      const wait = Math.max(0, wanted - (performance.now() - started))
      await new Promise((resolve) => setTimeout(resolve, wait))
      if (token !== tokenRef.current) return
      const next = tryMove(game, uci.slice(0, 2) as Square, uci.slice(2, 4) as Square, uci[4])
      setThinking(false)
      if (next) setGame(next)
    }
    void run()
    return () => {
      tokenRef.current += 1
      engine.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, game, finished, playerColor])

  // The game just ended: stamp the result into the PGN headers.
  useEffect(() => {
    if (phase !== 'playing' || !finished || !result) return
    setPhase('over')
    setThinking(false)
    setSelected(null)
    setPendingPromotion(null)
    setGame((current) => ({ ...current, headers: { ...(current.headers ?? {}), Result: result } }))
  }, [phase, finished, result])

  function startGame() {
    const color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice
    tokenRef.current += 1
    setPlayerColor(color)
    setResigned(null)
    setSelected(null)
    setPendingPromotion(null)
    setManualFlip(false)
    setNotice(null)
    setThinking(false)
    setGame({
      ...newGame(),
      headers: {
        Event: 'Latihan vs Bot',
        Date: todayPgn(),
        White: color === 'w' ? playerName : `Bot ${rating}`,
        Black: color === 'b' ? playerName : `Bot ${rating}`,
        [color === 'w' ? 'BlackElo' : 'WhiteElo']: String(rating),
        Result: '*',
      },
    })
    setPhase('playing')
  }

  function backToSetup() {
    tokenRef.current += 1
    engineRef.current?.stop()
    setThinking(false)
    setPhase('setup')
    setGame(newGame())
    setResigned(null)
    setSelected(null)
    setPendingPromotion(null)
  }

  function commit(from: Square, to: Square, promotion?: string) {
    const next = tryMove(game, from, to, promotion)
    if (next) setGame(next)
    setSelected(null)
    setPendingPromotion(null)
  }

  function onSquare(square: Square) {
    if (!myTurn || pendingPromotion) return
    if (selected && selected !== square) {
      const legal = position.moves({ square: selected, verbose: true }).some((move) => move.to === square)
      if (legal) {
        if (needsPromotion(position, selected, square)) setPendingPromotion({ from: selected, to: square })
        else commit(selected, square)
        return
      }
    }
    const piece = position.get(square)
    setSelected(piece && piece.color === playerColor && selected !== square ? square : null)
  }

  function takeback() {
    if (phase !== 'playing' || !game.moves.length) return
    tokenRef.current += 1
    engineRef.current?.stop()
    setThinking(false)
    const keep = Math.max(0, game.moves.length - (turn === playerColor ? 2 : 1))
    setGame((current) => ({ ...current, moves: current.moves.slice(0, keep), cursor: keep }))
    setSelected(null)
    setPendingPromotion(null)
  }

  function resign() {
    if (phase !== 'playing') return
    tokenRef.current += 1
    engineRef.current?.stop()
    setResigned(playerColor)
  }

  function reviewGame() {
    setPendingGame(game)
    navigate('/review')
  }

  function saveGame() {
    const saved = saveGameToLibrary(game)
    setNotice(saved.ok ? (saved.created ? 'Permainan disimpan ke Library.' : 'Permainan di Library diperbarui.') : 'Browser menolak menyimpan (penyimpanan penuh atau diblokir).')
  }

  const params = botParams(rating)
  const statusText = phase === 'setup' ? 'Atur lawan, lalu mulai'
    : phase === 'over' ? (outcome === 'win' ? 'Anda menang' : outcome === 'loss' ? 'Anda kalah' : 'Seri')
    : thinking ? 'Bot sedang berpikir…'
    : turn === playerColor ? 'Giliran Anda' : 'Menunggu bot…'

  const playerLabel = (color: 'w' | 'b', name: string, bot: boolean) => (
    <div className={`play-player${turn === color && phase === 'playing' ? ' on-turn' : ''}`}>
      <span className="play-player-piece"><Piece color={color} type="k" style={settings.pieceStyle} textPresentation={isMobile} /></span>
      <strong>{name}</strong>
      {bot && <small>{botLevelLabel(rating)} · {rating}</small>}
      {bot && thinking && <i className="think-dots" aria-label="Bot berpikir"><b /><b /><b /></i>}
    </div>
  )
  const topColor = flipped ? 'w' : 'b'
  const bottomColor = topColor === 'w' ? 'b' : 'w'
  const nameOf = (color: 'w' | 'b') => (color === playerColor ? playerName : botName)

  return (
    <div className="page analysis-page studio-page play-page">
      <div className="analysis-heading">
        <div>
          <div className="eyebrow">CHESS UNLIMITED / IMPROVE</div>
          <h1>Play <span>vs Bot</span></h1>
          <p>Lawan latihan yang bermain seperti manusia: kadang ragu, kadang lengah. Hanya untuk berlatih di aplikasi ini.</p>
        </div>
        <div className="engine-status"><i className={engineError ? '' : 'status-ready'} />{engineError ? 'Engine bermasalah' : statusText}</div>
      </div>

      <div className="analysis-layout">
        <section className="board-column">
          <div className="board-toolbar"><span>{phase === 'setup' ? 'PAPAN LATIHAN' : `VS ${botName.toUpperCase()}`}</span><div className="board-toolbar-actions"><button onClick={() => setManualFlip((value) => !value)} title="Balik papan"><ArrowDownUp size={15} /></button></div></div>
          {playerLabel(topColor, nameOf(topColor), topColor !== playerColor)}
          <div className="play-board-holder">
            <PlayBoard
              fen={fen}
              flipped={flipped}
              theme={settings.boardTheme}
              pieceStyle={settings.pieceStyle}
              turn={myTurn ? playerColor : undefined}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              textPresentation={isMobile}
              disabled={phase === 'setup' || Boolean(pendingPromotion)}
              label="Play board"
              onSquare={onSquare}
            />
            {pendingPromotion && (
              <div className="promotion-overlay" role="dialog" aria-label="Pilih bidak promosi" onClick={() => setPendingPromotion(null)}>
                <div className="promotion-card" onClick={(event) => event.stopPropagation()}>
                  <span className="promotion-title">PROMOSI PION</span>
                  <div className="promotion-options">
                    {PROMOTION_CHOICES.map(({ type, name }) => <button key={type} aria-label={name} title={name} onClick={() => commit(pendingPromotion.from, pendingPromotion.to, type)}><Piece color={playerColor} type={type} style={settings.pieceStyle} textPresentation={isMobile} /></button>)}
                  </div>
                  <button className="promotion-cancel" onClick={() => setPendingPromotion(null)}>Batal</button>
                </div>
              </div>
            )}
          </div>
          {playerLabel(bottomColor, nameOf(bottomColor), bottomColor !== playerColor)}
          <div className="board-footer"><span>{phase === 'over' ? 'FINISHED' : `${turn === 'w' ? 'WHITE' : 'BLACK'} TO MOVE`}</span><span>{status.over ? status.label : resigned ? 'RESIGNED' : status.check ? 'CHECK' : 'VS BOT'}</span><span>{game.moves.length} PLY</span></div>
        </section>

        <aside className="engine-column">
          <div className="side-grid">
            <div className="side-col side-col-a">
              {phase === 'setup' ? (
                <section className="review-card bot-setup">
                  <div className="eyebrow"><Bot size={13} /> LAWAN LATIHAN</div>
                  <h3>Bot manusiawi · {rating} <span className="eco-badge">{botLevelLabel(rating)}</span></h3>
                  <input className="bot-slider" type="range" min={MIN_BOT_RATING} max={MAX_BOT_RATING} step={50} value={rating} onChange={(event) => setRating(Number(event.target.value))} aria-label="Rating bot" />
                  <div className="bot-slider-scale"><span>{MIN_BOT_RATING}</span><span>{MAX_BOT_RATING}</span></div>
                  <p className="current-sub">{LEVEL_HINT(rating)} Bot menimbang {params.multiPv} langkah kandidat dengan kedalaman {params.depth}.</p>
                  <div className="legend-title">Warna Anda</div>
                  <div className="mode-tabs">
                    {([['w', 'Putih'], ['random', 'Acak'], ['b', 'Hitam']] as const).map(([value, label]) => <button key={value} className={`mode-tab${colorChoice === value ? ' active' : ''}`} aria-pressed={colorChoice === value} onClick={() => setColorChoice(value)}>{label}</button>)}
                  </div>
                  <label className="toggle-row" htmlFor="human-time">
                    <span><strong>Waktu berpikir alami</strong><small>Bot memikirkan langkah 0,5–3 detik: cepat di pembukaan, lebih lama di posisi rumit.</small></span>
                    <input id="human-time" type="checkbox" role="switch" checked={humanTime} onChange={(event) => setHumanTime(event.target.checked)} />
                  </label>
                  <div className="review-run"><button className="analyze-button" onClick={startGame}><Play size={16} fill="currentColor" /> Mulai bermain</button></div>
                  {engineError && <p className="engine-error">{engineError}</p>}
                </section>
              ) : (
                <section className="review-card play-status">
                  <div className="eyebrow"><Bot size={13} /> STATUS PERMAINAN</div>
                  <h3>{statusText}</h3>
                  <p className="current-sub">{botName} ({botLevelLabel(rating)}) · Anda main {playerColor === 'w' ? 'Putih' : 'Hitam'}.</p>
                  {phase === 'over' && (
                    <>
                      <p className="current-text">{status.over ? status.label.replace('·', '—') : 'Anda menyerah.'}</p>
                      <div className="review-run">
                        <button className="analyze-button" onClick={reviewGame}><GraduationCap size={16} /> Review game</button>
                        <button className="mini-button text" onClick={saveGame}><Save size={15} /> Simpan ke Library</button>
                        <button className="mini-button text" onClick={backToSetup}><RotateCcw size={15} /> Main lagi</button>
                      </div>
                    </>
                  )}
                  {phase === 'playing' && (
                    <div className="review-run">
                      <button className="mini-button text" onClick={takeback} disabled={!game.moves.length}><Undo2 size={15} /> Takeback</button>
                      <button className="mini-button text danger" onClick={resign}><Flag size={15} /> Menyerah</button>
                      <button className="mini-button text" onClick={backToSetup}><RotateCcw size={15} /> Game baru</button>
                    </div>
                  )}
                  {notice && <p className="game-notice ok" role="status">{notice}</p>}
                  {engineError && <p className="engine-error">{engineError}</p>}
                </section>
              )}
              <section className="review-card opening-card" aria-label="Pembukaan">
                <div className="eyebrow">PEMBUKAAN</div>
                <strong className="opening-name">{opening ? opening.name : 'Belum terdeteksi'}</strong>
                {opening && <p className="current-sub">ECO {opening.eco}</p>}
              </section>
            </div>
            <div className="side-col side-col-b">
              <section className="moves-card">
                <div className="moves-heading"><div className="eyebrow">MOVE LIST</div><span>{game.moves.length} PLY</span></div>
                {rows.length ? (
                  <ol className="move-list">{rows.map((row) => <li className="move-row" key={row.number}><span className="move-number">{row.number}.</span>{row.white ? <span className="move-chip static">{row.white.san}</span> : <span className="move-chip empty">…</span>}{row.black && <span className="move-chip static">{row.black.san}</span>}</li>)}</ol>
                ) : <div className="pv-empty">Belum ada langkah. {phase === 'setup' ? 'Mulai permainan untuk bermain.' : ''}</div>}
              </section>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
