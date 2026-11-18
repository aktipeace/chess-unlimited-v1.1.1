import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Download, Gauge, HardDrive, Palette, Smartphone, Trash2, Upload, UserRound } from 'lucide-react'
import { Piece } from '../components/board/Piece'
import { libraryStore, useLibrary } from '../features/library/libraryStore'
import { createBackup, parseBackup, type BackupData } from '../features/settings/backup'
import {
  BOARD_THEMES,
  BOARD_THEME_LABELS,
  PIECE_STYLES,
  PIECE_STYLE_LABELS,
  HASH_OPTIONS,
  REVIEW_DEPTHS,
  THREAD_OPTIONS,
  cleanName,
  type BoardTheme,
  type PieceStyle,
} from '../features/settings/settingsModel'
import { settingsStore, updateSettings, useSettings } from '../features/settings/settingsStore'
import { trainingStore, useTrainingProgress } from '../features/training/trainingStore'
import { storageUsage } from '../lib/storage'
import { APP_VERSION } from '../lib/version'
import { applyUpdate, promptInstall, usePwaState } from '../pwa/pwaState'

type Notice = { kind: 'ok' | 'error'; text: string } | null

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row" htmlFor={id}>
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function Section({ icon, eyebrow, title, children }: { icon: ReactNode; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="review-card settings-section">
      <div className="eyebrow">{icon} {eyebrow}</div>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function SettingsPage() {
  const settings = useSettings()
  const library = useLibrary()
  const training = useTrainingProgress()
  const pwa = usePwaState()
  const [nameDraft, setNameDraft] = useState(settings.playerName)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<{ data: BackupData; exportedAt: string | null } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reviewed = library.games.filter((game) => game.review).length
  const solved = Object.values(training.items).filter((item) => item.solved).length
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated

  function commitName() {
    const clean = cleanName(nameDraft, settings.playerName)
    setNameDraft(clean)
    if (clean !== settings.playerName) updateSettings({ playerName: clean })
  }

  function exportBackup() {
    const backup = createBackup({ settings: settingsStore.get(), library: libraryStore.get(), training: trainingStore.get() })
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `chess-unlimited-cadangan-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice({ kind: 'ok', text: 'Cadangan diunduh.' })
  }

  async function chooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const parsed = parseBackup(await file.text())
      if (!parsed.ok) {
        setPending(null)
        setNotice({ kind: 'error', text: parsed.error })
        return
      }
      setPending({ data: parsed.data, exportedAt: parsed.exportedAt })
      setNotice(null)
    } catch {
      setNotice({ kind: 'error', text: 'File tidak bisa dibaca.' })
    }
  }

  function applyBackup() {
    if (!pending) return
    const results = [settingsStore.set(pending.data.settings), libraryStore.set(pending.data.library), trainingStore.set(pending.data.training)]
    setNameDraft(pending.data.settings.playerName)
    setPending(null)
    setNotice(results.every(Boolean) ? { kind: 'ok', text: 'Cadangan dipulihkan.' } : { kind: 'error', text: 'Sebagian data tidak bisa disimpan ke browser (penyimpanan penuh).' })
  }

  function resetAll() {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    settingsStore.reset()
    libraryStore.reset()
    trainingStore.reset()
    setNameDraft(settingsStore.get().playerName)
    setConfirmReset(false)
    setNotice({ kind: 'ok', text: 'Semua data lokal dihapus dan pengaturan dikembalikan ke bawaan.' })
  }

  return (
    <div className="page analysis-page settings-page">
      <div className="analysis-heading">
        <div>
          <div className="eyebrow">CHESS UNLIMITED / PREFERENCES</div>
          <h1><span>Settings</span></h1>
          <p>Sesuaikan papan, engine, dan data lokal. Semua tersimpan otomatis di browser ini.</p>
        </div>
        <div className="engine-status"><i className="status-ready" />Versi {APP_VERSION}</div>
      </div>

      <div className="settings-grid">
        <Section icon={<UserRound size={12} />} eyebrow="PROFIL" title="Nama pemain">
          <label className="field-label" htmlFor="player-name">NAMA</label>
          <input id="player-name" className="text-field" value={nameDraft} maxLength={40} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitName} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
          <p className="engine-note">Ditampilkan di Overview. Jika sama dengan nama di PGN (White/Black), statistik, rekor, dan latihan dari kesalahan hanya memakai sisimu.</p>
        </Section>

        <Section icon={<Palette size={12} />} eyebrow="PAPAN" title="Tampilan papan">
          <label className="field-label" htmlFor="board-theme">TEMA PAPAN</label>
          <select id="board-theme" className="text-field" value={settings.boardTheme} onChange={(event) => updateSettings({ boardTheme: event.target.value as BoardTheme })}>
            {BOARD_THEMES.map((theme) => <option key={theme} value={theme}>{BOARD_THEME_LABELS[theme]}</option>)}
          </select>
          <div className={`theme-preview chess-board theme-${settings.boardTheme}`} aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => <div key={index} className={`board-square ${(Math.floor(index / 8) + index) % 2 === 0 ? 'light' : 'dark'}`} />)}
          </div>
          <label className="field-label" htmlFor="piece-style">BENTUK BIDAK</label>
          <select id="piece-style" className="text-field" value={settings.pieceStyle} onChange={(event) => updateSettings({ pieceStyle: event.target.value as PieceStyle })}>
            {PIECE_STYLES.map((style) => <option key={style} value={style}>{PIECE_STYLE_LABELS[style]}</option>)}
          </select>
          <div className={`piece-preview chess-board theme-${settings.boardTheme}`} aria-hidden="true">
            {(['w', 'b'] as const).flatMap((color, row) => ['k', 'q', 'r', 'b', 'n', 'p'].map((type, col) => (
              <div key={`${color}${type}`} className={`board-square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`}><Piece color={color} type={type} style={settings.pieceStyle} /></div>
            )))}
          </div>
          <Toggle id="coords" label="Tampilkan koordinat" hint="Huruf a–h dan angka 1–8 di tepi papan" checked={settings.showCoordinates} onChange={(value) => updateSettings({ showCoordinates: value })} />
          <Toggle id="arrow" label="Panah langkah di Review" hint="Panah langkah yang dimainkan (warna = kualitas) dan panah hijau langkah terbaik" checked={settings.showBestArrow} onChange={(value) => updateSettings({ showBestArrow: value })} />
        </Section>

        <Section icon={<Gauge size={12} />} eyebrow="ENGINE" title="Game Review dan Analysis">
          <label className="field-label" htmlFor="review-depth-setting">DEPTH GAME REVIEW</label>
          <select id="review-depth-setting" className="text-field" value={settings.reviewDepth} onChange={(event) => updateSettings({ reviewDepth: Number(event.target.value) })}>
            {REVIEW_DEPTHS.map((depth) => <option key={depth} value={depth}>{depth}</option>)}
          </select>
          <Toggle id="autosave" label="Simpan review otomatis ke Library" hint="Setiap review yang selesai langsung disimpan" checked={settings.autoSaveReviews} onChange={(value) => updateSettings({ autoSaveReviews: value })} />
          <Toggle id="engine-auto" label="Profil engine otomatis" hint="Ringan di HP, lebih kuat di komputer. Matikan untuk mengatur sendiri." checked={settings.engineAuto} onChange={(value) => updateSettings({ engineAuto: value })} />
          {!settings.engineAuto && (
            <div className="engine-controls">
              <label>MODE PENCARIAN<select value={settings.engine.continuous ? 'continuous' : 'depth'} onChange={(event) => updateSettings({ engine: { continuous: event.target.value === 'continuous' } })}><option value="continuous">Continuous</option><option value="depth">Fixed depth</option></select></label>
              <label>DEPTH <strong>{settings.engine.depth}</strong><input type="range" min="5" max="30" value={settings.engine.depth} disabled={settings.engine.continuous} onChange={(event) => updateSettings({ engine: { depth: Number(event.target.value) } })} /></label>
              <div className="settings-row">
                <label>HASH<select value={settings.engine.hash} onChange={(event) => updateSettings({ engine: { hash: Number(event.target.value) } })}>{HASH_OPTIONS.map((value) => <option key={value} value={value}>{value} MB</option>)}</select></label>
                <label>THREADS<select value={settings.engine.threads} onChange={(event) => updateSettings({ engine: { threads: Number(event.target.value) } })}>{THREAD_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              </div>
              <label className="multipv-label">MULTIPV<select value={settings.engine.multiPv} onChange={(event) => updateSettings({ engine: { multiPv: Number(event.target.value) } })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} line{value > 1 ? 's' : ''}</option>)}</select></label>
            </div>
          )}
          <p className="engine-note">Perubahan engine berlaku saat Analysis Studio dibuka berikutnya. Mode engine saat ini: {isolated ? 'multi-thread (cross-origin isolated)' : 'single-thread (halaman tidak cross-origin isolated)'}.</p>
        </Section>

        <Section icon={<Smartphone size={12} />} eyebrow="APLIKASI" title="Pasang dan offline">
          <p className="engine-note">
            {pwa.installed ? 'Berjalan sebagai aplikasi terpasang.' : pwa.canInstall ? 'Aplikasi ini bisa dipasang di perangkatmu.' : 'Opsi pasang muncul di menu browser (mis. "Tambahkan ke layar utama") bila didukung.'}
            {' '}{pwa.offlineReady ? 'Mode offline siap: aplikasi dan Stockfish tersimpan di perangkat.' : pwa.supported ? 'Mode offline aktif setelah aplikasi dibuka sekali lewat HTTPS (build produksi).' : 'Browser ini tidak mendukung service worker.'}
          </p>
          <div className="game-actions">
            <button className="mini-button text" disabled={!pwa.canInstall} onClick={() => void promptInstall()}><Smartphone size={14} /> Pasang aplikasi</button>
            {pwa.updateReady && <button className="analyze-button" onClick={applyUpdate}>Pembaruan siap — muat ulang</button>}
          </div>
        </Section>

        <Section icon={<HardDrive size={12} />} eyebrow="DATA LOKAL" title="Cadangan dan penghapusan">
          <p className="engine-note">{library.games.length} permainan ({reviewed} direview) · {solved} puzzle selesai · {formatBytes(storageUsage())} terpakai di browser ini.</p>
          <div className="game-actions">
            <button className="mini-button text" onClick={exportBackup}><Download size={14} /> Unduh cadangan</button>
            <button className="mini-button text" onClick={() => fileRef.current?.click()}><Upload size={14} /> Pulihkan dari file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={chooseBackup} />
          </div>
          {pending && (
            <div className="review-card nested">
              <p className="engine-note">Cadangan{pending.exportedAt ? ` (${pending.exportedAt.slice(0, 10)})` : ''}: {pending.data.library.games.length} permainan, {Object.keys(pending.data.training.items).length} item latihan. Memulihkan akan <strong>mengganti</strong> data saat ini.</p>
              <div className="game-actions"><button className="analyze-button" onClick={applyBackup}>Ganti dengan cadangan</button><button className="mini-button text" onClick={() => setPending(null)}>Batal</button></div>
            </div>
          )}
          <div className="game-actions">
            <button className={`mini-button text${confirmReset ? ' danger' : ''}`} onClick={resetAll} onBlur={() => setConfirmReset(false)}><Trash2 size={14} /> {confirmReset ? 'Yakin? Hapus semua data lokal' : 'Hapus semua data lokal'}</button>
          </div>
          {notice && <p className={`game-notice ${notice.kind}`} role="status">{notice.text}</p>}
        </Section>
      </div>
    </div>
  )
}
