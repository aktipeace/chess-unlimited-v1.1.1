# Chess Unlimited v1.1.1 — Personal Edition

A local-first chess workspace built with React, Vite, and TypeScript.

## Current release — v1.1.1

This release introduces the Emerald Graphite visual identity, a redesigned dashboard welcome area, refreshed shared UI styling, updated PWA colors and icons, and a new service-worker cache namespace. Existing chess workflows and local-first storage are retained. See [CHANGELOG.md](./CHANGELOG.md) for details.

## Phase 2 — Analysis Studio

- Legal chess moves and position handling powered by `chess.js`.
- Stockfish 19 Lite WebAssembly engine loaded in a dedicated Web Worker.
- UCI communication, Start/Stop/Reset controls, depth, hash, threads, and MultiPV settings.
- Evaluation, best move, and principal variation output.
- Engine runs locally in the browser; no API key or account is required.

## Phase 3 — Analysis Studio, complete

- Full move history with navigation (first / previous / next / last, ← → Home End), and a clickable move list.
- Promotion picker (queen, rook, bishop, knight) instead of an automatic queen.
- Game status: check, checkmate, stalemate, insufficient material, repetition and 50-move draws.
- Last-move and check highlights; evaluation bar and scores are now shown from White's point of view.
- FEN and PGN: copy the current FEN, load a FEN, paste/load/export a PGN, download a `.pgn`, or open a `.pgn` file.

## Phase 4 — Game Review

Open **Game Review**, paste a PGN (or press *Contoh* for Morphy's Opera Game, open a `.pgn` file, or use *Review game* from the Analysis Studio) and press **Start review**. Stockfish evaluates every position of the game one after another (depth 10–18, default 14, 12 on phones) in its own worker, so the live engine in the Analysis Studio is untouched. Cancel at any time; the evaluation graph keeps the partial result.

- **Move quality** per move, from the win-probability the mover gave up versus the engine's best move (Lichess' logistic model, `win% = 50 + 50·(2/(1+e^(-0.00368208·cp)) − 1)`): best (engine move), excellent (<1%), good (<5%), inaccuracy (<10%), mistake (<15%), blunder (≥15%).
- **Accuracy** per move is `103.1668·e^(−0.04354·loss) − 3.1669` (0–100); a side's accuracy blends the arithmetic and harmonic mean so a few blunders weigh more. **ACPL** is the average centipawn loss (each evaluation clamped to ±1000 cp).
- Scores are stored from White's point of view; checkmate and drawn positions are evaluated without the engine.
- Click a move, the evaluation graph, or use ← → Home End to browse. The arrow on the board is the engine's suggestion for the displayed position. *Open in Analysis* continues the game at the selected move.

## Phase 5 — Library, Settings, PWA

- **Game Library** (`/library`): games and their review are saved in the browser (`localStorage`). The same moves never create a duplicate (id = hash of start position and moves). Search, rename, download PGN, delete (two-step confirm), import a multi-game PGN or file. *Review* on a saved game restores its stored review without re-running the engine.
- Game Review saves finished reviews automatically (switch off in Settings). Analysis Studio and Game Review have a **Simpan** button.
- **Settings** (`/settings`): player name (recognises your side in PGNs), board theme, coordinates, best-move arrow, review depth, auto-save, engine profile (automatic by device, or custom depth / hash / threads / MultiPV), install button, **backup/restore** of everything as one JSON file, and "delete all local data".
- **PWA**: `manifest.webmanifest`, icons, and `public/sw.js`. After one visit to a production build over HTTPS the app shell and Stockfish are cached and work offline. A new version waits until you press "Pembaruan siap — muat ulang" in Settings. The service worker is registered only in production builds, never by `npm run dev`.
- All stored data is validated when read (`sanitize*` functions); corrupt or hand-edited data falls back to defaults instead of crashing. If the browser refuses a write (full quota, private mode) the UI says so.

## Phase 6 — Opening Explorer

`/openings` browses a curated book of 188 popular lines (ECO code, name, short idea for the main families) stored in `src/features/openings/openingData.ts`. The Analysis Studio and Game Review show the detected opening and where the game left the book. The explorer lists the book moves from any position, searches by name or ECO (accent-insensitive), and opens the line in the Analysis Studio.

The data is **generated**: edit `scripts/data/openings.source.mjs`, then run `node scripts/build-openings.mjs`. The build rejects illegal lines, duplicates, and lines Stockfish (depth 12) rates beyond ±150 cp (±300 cp for gambits). It is a curated list, not a statistics database: there are no win-rate numbers.

## Phase 7 — Training Center

`/training` has two modes:

- **Puzzle taktik**: 81 puzzles in `src/features/training/puzzleData.ts` (mate in 1 / 2 / 3 and "win material"). They were found by Stockfish self-play and re-verified at depth 18: for mates every solver move must keep the shortest forced mate and the line must end in checkmate; for material the first move must be at least 200 cp better than every alternative and the solver must end at least 2 points up. On the final move of a mate puzzle any checkmating move is accepted.
- **Dari kesalahanmu**: every mistake/blunder saved by Game Review becomes an exercise (position before your move, engine move as the answer). Only your side is used when your name in Settings matches the PGN.

Hints, "Lihat jawaban" and retries are tracked: a solve only counts as clean without them. Progress and a daily streak are stored locally.

Regenerate puzzles (needs the engine files in `public/engine`; takes a while):

```bash
node scripts/gen-puzzles.mjs --seed 1 --games 300 --out puz.json
node scripts/merge-puzzles.mjs puz.json   # re-verifies and rewrites puzzleData.ts
node scripts/selftest.mjs                 # checks the dev chess module against perft and Stockfish
```

## Phase 8 — Release 1.0

- Overview shows real numbers: games saved / reviewed, average accuracy, training streak, recent games, training progress per theme.
- `ErrorBoundary` around the app and each route: a crash shows a recovery screen and navigating away clears it.
- Tests for storage, settings, library, openings, training, backup, puzzle data, route rendering and the error boundary.
- Deployment headers for Netlify/Cloudflare Pages (`public/_headers`) and Vercel (`vercel.json`): COOP/COEP for the multi-thread engine, SPA fallback, `sw.js` never cached.

## Where data lives

All keys are in `localStorage` with the prefix `chess-unlimited:` — `settings:v1`, `library:v1` (max 300 games), `training:v1`. Nothing is sent to a server. Clearing site data removes it; use Settings → *Unduh cadangan* to keep a copy.

## Deploying

```bash
npm.cmd run build        # outputs dist/
```

Serve `dist/` over **HTTPS** (needed for the service worker and for `SharedArrayBuffer`). Netlify and Cloudflare Pages read `public/_headers`; Vercel reads `vercel.json`. Without COOP/COEP headers the app still works with the single-thread engine. Bump `VERSION` in `public/sw.js` and `APP_VERSION` in `src/lib/version.ts` for each release so old caches are dropped.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Setup

```bash
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Validation

```bash
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

## Notes

The Stockfish WASM package is downloaded as an npm dependency during installation. A postinstall script copies the browser engine files into `public/engine`, where Vite serves them locally. The first dependency installation requires an internet connection; after dependencies are installed, engine analysis runs locally in the browser. The multi-threaded WASM build requires the COOP/COEP headers configured in `vite.config.ts`. Stockfish.js is distributed under GPL-3.0.

## Mobile

- Below 760px the sidebar becomes a bottom tab bar; safe-area insets, 16px form controls (no iOS zoom) and larger touch targets are applied. Desktop layout is unchanged.
- On phones the engine starts with a lighter profile (1 thread, 32 MB hash, fixed depth 14, 2 lines) and pauses while the page is in the background.
- The multi-thread engine needs `SharedArrayBuffer`, which is only available on HTTPS or localhost. When the page is not cross-origin isolated (for example `http://<LAN-IP>:5173` on a phone) the app automatically loads the single-thread build `public/engine/stockfish-single.js`. `npm install` / `npm run dev` copy it from `node_modules/stockfish/bin` when it exists.

Test on a phone on the same Wi-Fi:

```bash
npm.cmd run dev
# then open http://<your-computer-LAN-IP>:5173 on the phone
```
