import { createPersistentStore, usePersistentStore } from '../../lib/persistentStore'
import { STORAGE_PREFIX } from '../../lib/storage'
import { DEFAULT_SETTINGS, patchSettings, sanitizeSettings, type EngineDefaults, type Settings } from './settingsModel'

export const SETTINGS_KEY = `${STORAGE_PREFIX}settings:v1`

export const settingsStore = createPersistentStore<Settings>({
  key: SETTINGS_KEY,
  fallback: () => ({ ...DEFAULT_SETTINGS, engine: { ...DEFAULT_SETTINGS.engine } }),
  sanitize: sanitizeSettings,
})

export function useSettings(): Settings {
  return usePersistentStore(settingsStore)
}

export function updateSettings(patch: Partial<Omit<Settings, 'engine'>> & { engine?: Partial<EngineDefaults> }) {
  return settingsStore.set((current) => patchSettings(current, patch))
}

/** Reads the current value outside React (event handlers, hooks that must not re-render). */
export function getSettings(): Settings {
  return settingsStore.get()
}
