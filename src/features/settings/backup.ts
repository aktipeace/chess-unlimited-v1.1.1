import { sanitizeLibrary, type Library } from '../library/libraryModel'
import { sanitizeProgress, type TrainingProgress } from '../training/trainingModel'
import { sanitizeSettings, type Settings } from './settingsModel'

/** Backup file: everything the app stores locally, in one JSON document. */
export const BACKUP_APP = 'chess-unlimited'
export const BACKUP_VERSION = 1

export type BackupData = { settings: Settings; library: Library; training: TrainingProgress }

export type BackupFile = BackupData & { app: typeof BACKUP_APP; version: number; exportedAt: string }

export function createBackup(data: BackupData, now: Date = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...data }
}

export type ParsedBackup = { ok: true; data: BackupData; exportedAt: string | null } | { ok: false; error: string }

/** Parses and sanitises a backup. Anything missing falls back to defaults; foreign files are rejected. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File bukan JSON yang valid.' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'Isi file tidak dikenali.' }
  const source = raw as Record<string, unknown>
  if (source.app !== BACKUP_APP) return { ok: false, error: 'Ini bukan file cadangan Chess Unlimited.' }
  if (typeof source.version === 'number' && source.version > BACKUP_VERSION) {
    return { ok: false, error: 'Cadangan ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi dulu.' }
  }
  return {
    ok: true,
    exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : null,
    data: {
      settings: sanitizeSettings(source.settings),
      library: sanitizeLibrary(source.library),
      training: sanitizeProgress(source.training),
    },
  }
}
