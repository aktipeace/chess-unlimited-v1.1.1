import { describe, expect, it } from 'vitest'
import { makeSavedGame } from '../library/libraryModel'
import { emptyProgress, recordSolved } from '../training/trainingModel'
import { createBackup, parseBackup } from './backup'
import { DEFAULT_SETTINGS, patchSettings } from './settingsModel'

const game = makeSavedGame({ id: 'g1', pgn: '[White "A"]\n[Black "B"]\n\n1. e4 e5 *', plies: 2, now: 5 })

describe('backup', () => {
  it('round-trips settings, library and training progress', () => {
    const settings = patchSettings(DEFAULT_SETTINGS, { boardTheme: 'ocean', playerName: 'Rani' })
    const training = recordSolved(emptyProgress(), 'p001', false, new Date(2026, 10, 15, 12).getTime())
    const file = createBackup({ settings, library: { version: 1, games: [game] }, training }, new Date('2026-11-15T10:00:00Z'))
    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.exportedAt).toBe('2026-11-15T10:00:00.000Z')
      expect(parsed.data.settings.boardTheme).toBe('ocean')
      expect(parsed.data.library.games.map((item) => item.id)).toEqual(['g1'])
      expect(parsed.data.training.items.p001.solved).toBe(true)
    }
  })

  it('rejects broken JSON, foreign files and newer versions', () => {
    expect(parseBackup('{oops').ok).toBe(false)
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('{"app":"other"}').ok).toBe(false)
    const newer = parseBackup(JSON.stringify({ app: 'chess-unlimited', version: 99 }))
    expect(newer.ok).toBe(false)
  })

  it('repairs missing sections with defaults', () => {
    const parsed = parseBackup(JSON.stringify({ app: 'chess-unlimited', version: 1, settings: { boardTheme: 'bogus' } }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.settings.boardTheme).toBe('classic')
      expect(parsed.data.library.games).toEqual([])
      expect(parsed.data.training).toEqual(emptyProgress())
    }
  })
})
