import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookMarked, Check, Download, FileUp, Pencil, Search, Trash2 } from 'lucide-react'
import { fromPgn } from '../features/analysis/gameModel'
import { MAX_GAMES, libraryStats, searchGames, splitPgnGames, type SavedGame } from '../features/library/libraryModel'
import { deleteGame, libraryStore, rename, saveGameToLibrary, useLibrary } from '../features/library/libraryStore'
import { openSavedGame } from '../features/library/openGame'
import { useSettings } from '../features/settings/settingsStore'

type Filter = 'all' | 'reviewed'
type Notice = { kind: 'ok' | 'error'; text: string } | null

function formatDate(timestamp: number) {
  try {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(timestamp))
  } catch {
    return ''
  }
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game'

export function LibraryPage() {
  const navigate = useNavigate()
  const library = useLibrary()
  const settings = useSettings()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [pgnText, setPgnText] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const stats = useMemo(() => libraryStats(library.games, settings.playerName), [library.games, settings.playerName])
  const visible = useMemo(() => {
    const matched = searchGames(library.games, query)
    return filter === 'reviewed' ? matched.filter((game) => game.review) : matched
  }, [library.games, query, filter])

  function importText(text: string) {
    const parts = splitPgnGames(text)
    if (!parts.length) {
      setNotice({ kind: 'error', text: 'Tidak ada PGN untuk diimpor.' })
      return
    }
    let saved = 0
    let skipped = 0
    for (const part of parts) {
      const state = fromPgn(part)
      if (!state) {
        skipped += 1
        continue
      }
      const outcome = saveGameToLibrary(state)
      if (outcome.ok) saved += 1
      else skipped += 1
    }
    setNotice(
      saved
        ? { kind: 'ok', text: `${saved} permainan disimpan${skipped ? `, ${skipped} dilewati (tidak valid atau penyimpanan penuh)` : ''}.` }
        : { kind: 'error', text: 'Tidak ada permainan yang bisa disimpan. Periksa format PGN atau ruang penyimpanan browser.' },
    )
    if (saved) setPgnText('')
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length) return
    try {
      const texts = await Promise.all(files.map((file) => file.text()))
      importText(texts.join('\n\n'))
    } catch {
      setNotice({ kind: 'error', text: 'File tidak bisa dibaca.' })
    }
  }

  function open(game: SavedGame, target: 'review' | 'analysis') {
    if (!openSavedGame(game, target)) {
      setNotice({ kind: 'error', text: 'PGN permainan ini rusak dan tidak bisa dibuka.' })
      return
    }
    navigate(target === 'review' ? '/review' : '/analysis')
  }

  function startRename(game: SavedGame) {
    setEditingId(game.id)
    setEditTitle(game.title)
    setConfirmId(null)
  }

  function commitRename() {
    if (editingId && editTitle.trim()) rename(editingId, editTitle)
    setEditingId(null)
  }

  function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    deleteGame(id)
    setConfirmId(null)
  }

  const writeFailed = !libraryStore.lastWriteOk()

  return (
    <div className="page analysis-page library-page">
      <div className="analysis-heading">
        <div>
          <div className="eyebrow">CHESS UNLIMITED / WORKSPACE</div>
          <h1>Game <span>Library</span></h1>
          <p>Permainan dan hasil review tersimpan di browser ini — tidak dikirim ke server mana pun.</p>
        </div>
        <div className="engine-status"><i className="status-ready" />{library.games.length} / {MAX_GAMES} permainan</div>
      </div>

      {writeFailed && <p className="game-notice error" role="alert">Browser menolak menyimpan data (penyimpanan penuh atau diblokir). Perubahan terakhir hanya ada sampai tab ini ditutup — unduh cadangan di Settings.</p>}

      <div className="analysis-layout">
        <section className="board-column library-list-column">
          <div className="library-toolbar">
            <div className="field-row">
              <input className="text-field" aria-label="Cari permainan" placeholder="Cari pemain, event, atau pembukaan" value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} />
              <span className="mini-button" aria-hidden="true"><Search size={15} /></span>
            </div>
            <div className="chip-row" role="group" aria-label="Filter">
              <button className={`chip${filter === 'all' ? ' active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Semua <b>{library.games.length}</b></button>
              <button className={`chip${filter === 'reviewed' ? ' active' : ''}`} aria-pressed={filter === 'reviewed'} onClick={() => setFilter('reviewed')}>Sudah direview <b>{stats.reviewed}</b></button>
            </div>
          </div>

          {visible.length === 0 ? (
            <section className="review-card empty-state">
              <div className="eyebrow">{library.games.length ? 'TIDAK ADA HASIL' : 'LIBRARY KOSONG'}</div>
              <h3>{library.games.length ? 'Tidak ada permainan yang cocok' : 'Belum ada permainan tersimpan'}</h3>
              <p className="engine-note">{library.games.length ? 'Ubah kata kunci atau filter.' : 'Impor PGN di samping, atau jalankan Game Review — hasilnya otomatis disimpan di sini (bisa diubah di Settings).'}</p>
              {!library.games.length && <div className="game-actions"><Link to="/review" className="mini-button text">Buka Game Review</Link></div>}
            </section>
          ) : (
            <ul className="game-list">
              {visible.map((game) => (
                <li key={game.id} className="game-item review-card">
                  <div className="game-item-head">
                    {editingId === game.id ? (
                      <input className="text-field" autoFocus aria-label="Judul permainan" value={editTitle} maxLength={80} onChange={(event) => setEditTitle(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setEditingId(null) }} />
                    ) : (
                      <h3>{game.title}</h3>
                    )}
                    <span className="game-result">{game.result === '1/2-1/2' ? '½-½' : game.result}</span>
                  </div>
                  <p className="game-meta">
                    {[game.event, game.date || formatDate(game.updatedAt), `${game.plies} ply`].filter(Boolean).join(' · ')}
                    {game.opening && <span className="eco-tag">{game.opening.eco} {game.opening.name}</span>}
                  </p>
                  {game.review ? (
                    <p className="game-meta accuracy-line"><Check size={12} /> Review depth {game.review.depth}: akurasi putih {game.review.whiteAccuracy === null ? '—' : `${game.review.whiteAccuracy.toFixed(1)}%`} · hitam {game.review.blackAccuracy === null ? '—' : `${game.review.blackAccuracy.toFixed(1)}%`}</p>
                  ) : (
                    <p className="game-meta">Belum direview.</p>
                  )}
                  <div className="game-actions">
                    <button className="mini-button text" onClick={() => open(game, 'review')}>{game.review ? 'Lihat review' : 'Review'}</button>
                    <button className="mini-button text" onClick={() => open(game, 'analysis')}>Analysis</button>
                    <button className="mini-button text" onClick={() => downloadText(`${slug(game.title)}.pgn`, game.pgn)} aria-label={`Unduh PGN ${game.title}`}><Download size={14} /> PGN</button>
                    <button className="mini-button text" onClick={() => startRename(game)} aria-label={`Ganti nama ${game.title}`}><Pencil size={14} /></button>
                    <button className={`mini-button text${confirmId === game.id ? ' danger' : ''}`} onClick={() => remove(game.id)} onBlur={() => setConfirmId((current) => (current === game.id ? null : current))} aria-label={`Hapus ${game.title}`}><Trash2 size={14} />{confirmId === game.id ? ' Yakin hapus?' : ''}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="engine-column">
          <section className="review-card">
            <div className="eyebrow"><BookMarked size={12} /> RINGKASAN</div>
            <div className="summary-grid">
              <div className="summary-side"><span className="summary-name">PERMAINAN</span><strong className="accuracy-value">{stats.total}</strong><span className="summary-sub">{stats.reviewed} sudah direview</span></div>
              <div className="summary-side"><span className="summary-name">AKURASI RATA-RATA</span><strong className="accuracy-value">{stats.averageAccuracy === null ? '—' : stats.averageAccuracy.toFixed(1)}<small>{stats.averageAccuracy === null ? '' : '%'}</small></strong><span className="summary-sub">{stats.accuracyScope === 'player' ? `Sisi ${settings.playerName}` : stats.accuracyScope === 'all' ? 'Kedua pemain' : 'Belum ada review'}</span></div>
            </div>
            {stats.gamesAsPlayer > 0 && <p className="engine-note">Rekor {settings.playerName}: {stats.record.wins} menang · {stats.record.draws} remis · {stats.record.losses} kalah ({stats.gamesAsPlayer} permainan dikenali dari nama di PGN).</p>}
          </section>

          <section className="review-card">
            <div className="eyebrow">IMPOR PGN</div>
            <label className="field-label" htmlFor="library-pgn">TEMPEL PGN (BISA BEBERAPA PERMAINAN)</label>
            <textarea id="library-pgn" className="text-field mono" rows={5} placeholder="Tempel PGN di sini" value={pgnText} onChange={(event) => setPgnText(event.target.value)} spellCheck={false} />
            <div className="game-actions">
              <button className="mini-button text" onClick={() => importText(pgnText)} disabled={!pgnText.trim()}>Simpan ke Library</button>
              <button className="mini-button text" onClick={() => fileInputRef.current?.click()}><FileUp size={14} /> Buka file</button>
              <input ref={fileInputRef} type="file" accept=".pgn,.txt,text/plain" multiple hidden onChange={importFile} />
            </div>
            {notice && <p className={`game-notice ${notice.kind}`} role="status">{notice.text}</p>}
          </section>

          <section className="review-card">
            <div className="eyebrow">TENTANG PENYIMPANAN</div>
            <p className="engine-note">Data disimpan di browser ini saja. Menghapus data situs atau memakai mode privat akan menghapusnya. Gunakan <Link to="/settings" className="inline-link">Settings → Cadangan</Link> untuk mengunduh semuanya. Permainan yang sama (langkah identik) tidak akan tersimpan dua kali.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
