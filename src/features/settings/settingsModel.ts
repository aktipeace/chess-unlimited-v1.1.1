/** Pure settings model: defaults, validation and merging. No React, no storage. */

export const BOARD_THEMES = ['classic', 'emerald', 'ocean', 'walnut', 'violet'] as const
export type BoardTheme = (typeof BOARD_THEMES)[number]

export const BOARD_THEME_LABELS: Record<BoardTheme, string> = {
  classic: 'Classic',
  emerald: 'Emerald',
  ocean: 'Ocean',
  walnut: 'Walnut',
  violet: 'Violet',
}

export const PIECE_STYLES = ['classic', 'solid', 'geometric', 'letter', 'neon'] as const
export type PieceStyle = (typeof PIECE_STYLES)[number]

export const PIECE_STYLE_LABELS: Record<PieceStyle, string> = {
  classic: 'Klasik (garis)',
  solid: 'Solid',
  geometric: 'Geometri',
  letter: 'Huruf (K Q R B N P)',
  neon: 'Neon',
}

export const REVIEW_DEPTHS = [10, 12, 14, 16, 18] as const
export const HASH_OPTIONS = [32, 64, 128, 256, 512] as const
export const THREAD_OPTIONS = [1, 2, 4, 8] as const

export type EngineDefaults = {
  depth: number
  hash: number
  threads: number
  multiPv: number
  continuous: boolean
}

export type Settings = {
  /** Name shown on the dashboard; also used to recognise "your" side in saved games. */
  playerName: string
  boardTheme: BoardTheme
  /** Look of the pieces: classic outline, solid, geometric, letters or neon. */
  pieceStyle: PieceStyle
  showCoordinates: boolean
  /** Draw the engine's best-move arrow in Game Review. */
  showBestArrow: boolean
  /** Depth used by Game Review (10-18). */
  reviewDepth: number
  /** Save every finished review to the Library automatically. */
  autoSaveReviews: boolean
  /** true = pick a light profile on phones and a stronger one on desktop; false = use `engine`. */
  engineAuto: boolean
  engine: EngineDefaults
}

export const DEFAULT_ENGINE: EngineDefaults = { depth: 18, hash: 128, threads: 2, multiPv: 3, continuous: true }

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'Pemain',
  boardTheme: 'classic',
  pieceStyle: 'classic',
  showCoordinates: true,
  showBestArrow: true,
  reviewDepth: 14,
  autoSaveReviews: true,
  engineAuto: true,
  engine: DEFAULT_ENGINE,
}

export const MAX_NAME_LENGTH = 40

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function oneOf<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'number' && (allowed as readonly number[]).includes(value) ? (value as T) : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function cleanName(value: unknown, fallback: string = DEFAULT_SETTINGS.playerName): string {
  if (typeof value !== 'string') return fallback
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return text || fallback
}

export function sanitizeEngine(raw: unknown): EngineDefaults {
  const source = isRecord(raw) ? raw : {}
  return {
    depth: clampInt(source.depth, 5, 30, DEFAULT_ENGINE.depth),
    hash: oneOf(source.hash, HASH_OPTIONS, DEFAULT_ENGINE.hash),
    threads: oneOf(source.threads, THREAD_OPTIONS, DEFAULT_ENGINE.threads),
    multiPv: clampInt(source.multiPv, 1, 5, DEFAULT_ENGINE.multiPv),
    continuous: bool(source.continuous, DEFAULT_ENGINE.continuous),
  }
}

/** Turns anything (corrupt JSON, an older version, hand-edited values) into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {}
  const theme = BOARD_THEMES.find((item) => item === source.boardTheme)
  return {
    playerName: cleanName(source.playerName),
    boardTheme: theme ?? DEFAULT_SETTINGS.boardTheme,
    pieceStyle: PIECE_STYLES.find((item) => item === source.pieceStyle) ?? DEFAULT_SETTINGS.pieceStyle,
    showCoordinates: bool(source.showCoordinates, DEFAULT_SETTINGS.showCoordinates),
    showBestArrow: bool(source.showBestArrow, DEFAULT_SETTINGS.showBestArrow),
    reviewDepth: oneOf(source.reviewDepth, REVIEW_DEPTHS, DEFAULT_SETTINGS.reviewDepth),
    autoSaveReviews: bool(source.autoSaveReviews, DEFAULT_SETTINGS.autoSaveReviews),
    engineAuto: bool(source.engineAuto, DEFAULT_SETTINGS.engineAuto),
    engine: sanitizeEngine(source.engine),
  }
}

export function patchSettings(current: Settings, patch: Partial<Omit<Settings, 'engine'>> & { engine?: Partial<EngineDefaults> }): Settings {
  return sanitizeSettings({ ...current, ...patch, engine: { ...current.engine, ...patch.engine } })
}

/**
 * Engine settings for the Analysis Studio. With `engineAuto` the caller's device profile wins
 * (light on phones); otherwise the saved custom values are used on every device.
 */
export function resolveEngineSettings(settings: Settings, deviceProfile: EngineDefaults): EngineDefaults {
  return settings.engineAuto ? deviceProfile : settings.engine
}
