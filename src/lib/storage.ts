/**
 * Safe wrapper around localStorage.
 *
 * Private mode, disabled storage, a full quota or corrupt JSON must never crash the app: reads
 * fall back to the default value and writes report failure instead of throwing. When
 * localStorage is unusable the data lives in memory for the current tab only.
 */

export const STORAGE_PREFIX = 'chess-unlimited:'

const memory = new Map<string, string>()
let resolved: Storage | null | undefined

function backend(): Storage | null {
  if (resolved !== undefined) return resolved
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      resolved = null
    } else {
      const probe = `${STORAGE_PREFIX}probe`
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      resolved = window.localStorage
    }
  } catch {
    resolved = null
  }
  return resolved
}

/**
 * Test helper: force a specific backend (a fake Storage, or null for "storage unavailable") and
 * clear the in-memory fallback. Pass undefined to go back to auto-detection.
 */
export function useStorageBackendForTests(store: Storage | null | undefined) {
  resolved = store
  memory.clear()
}

export function readRaw(key: string): string | null {
  const store = backend()
  if (!store) return memory.get(key) ?? null
  try {
    // A value that could not be persisted (full quota) still lives in memory for this tab.
    return store.getItem(key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}

/** Returns false when the value could not be persisted (quota exceeded, storage blocked). */
export function writeRaw(key: string, value: string): boolean {
  const store = backend()
  if (!store) {
    memory.set(key, value)
    return true
  }
  try {
    store.setItem(key, value)
    return true
  } catch {
    memory.set(key, value)
    return false
  }
}

export function removeRaw(key: string) {
  memory.delete(key)
  try {
    backend()?.removeItem(key)
  } catch {
    // ignore: nothing else to do
  }
}

/** All keys that belong to this app. */
export function appKeys(): string[] {
  const store = backend()
  const keys = new Set<string>([...memory.keys()].filter((key) => key.startsWith(STORAGE_PREFIX)))
  if (store) {
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index)
        if (key && key.startsWith(STORAGE_PREFIX)) keys.add(key)
      }
    } catch {
      // ignore
    }
  }
  return [...keys].sort()
}

export function readJson(key: string): unknown {
  const raw = readRaw(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function writeJson(key: string, value: unknown): boolean {
  return writeRaw(key, JSON.stringify(value))
}

/** Approximate bytes used by this app's keys in localStorage (UTF-16, so 2 bytes per character). */
export function storageUsage(): number {
  let total = 0
  for (const key of appKeys()) total += (key.length + (readRaw(key)?.length ?? 0)) * 2
  return total
}
