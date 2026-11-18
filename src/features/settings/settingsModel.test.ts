import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, cleanName, patchSettings, resolveEngineSettings, sanitizeSettings } from './settingsModel'

describe('settings model', () => {
  it('returns the defaults for missing or non-object input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects invalid values field by field and keeps the valid ones', () => {
    const result = sanitizeSettings({ boardTheme: 'neon', showCoordinates: false, reviewDepth: 99, autoSaveReviews: 'yes', playerName: '   ' })
    expect(result.boardTheme).toBe('classic')
    expect(result.showCoordinates).toBe(false)
    expect(result.reviewDepth).toBe(14)
    expect(result.autoSaveReviews).toBe(true)
    expect(result.playerName).toBe(DEFAULT_SETTINGS.playerName)
  })

  it('clamps engine values into safe ranges', () => {
    const result = sanitizeSettings({ engine: { depth: 500, hash: 3, threads: 64, multiPv: 0, continuous: false } })
    expect(result.engine.depth).toBe(30)
    expect(result.engine.hash).toBe(DEFAULT_SETTINGS.engine.hash)
    expect(result.engine.threads).toBe(DEFAULT_SETTINGS.engine.threads)
    expect(result.engine.multiPv).toBe(1)
    expect(result.engine.continuous).toBe(false)
  })

  it('trims and limits the player name', () => {
    expect(cleanName('  Bunga   Putri ')).toBe('Bunga Putri')
    expect(cleanName('x'.repeat(100)).length).toBe(40)
    expect(cleanName(42)).toBe(DEFAULT_SETTINGS.playerName)
  })

  it('patches without losing other engine fields', () => {
    const next = patchSettings(DEFAULT_SETTINGS, { engine: { depth: 22 }, boardTheme: 'walnut' })
    expect(next.engine.depth).toBe(22)
    expect(next.engine.hash).toBe(DEFAULT_SETTINGS.engine.hash)
    expect(next.boardTheme).toBe('walnut')
  })

  it('uses the device profile only in auto mode', () => {
    const phone = { depth: 14, hash: 32, threads: 1, multiPv: 2, continuous: false }
    expect(resolveEngineSettings(DEFAULT_SETTINGS, phone)).toEqual(phone)
    const custom = patchSettings(DEFAULT_SETTINGS, { engineAuto: false, engine: { depth: 20 } })
    expect(resolveEngineSettings(custom, phone).depth).toBe(20)
  })
})
