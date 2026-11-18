import { useSyncExternalStore } from 'react'
import { readJson, writeJson } from './storage'

/**
 * A tiny observable store that is mirrored to localStorage.
 *
 * - `sanitize` turns anything read from storage (possibly corrupt, old or hand-edited) into a valid value.
 * - Other tabs are kept in sync through the `storage` event.
 * - `set` never throws: `lastWriteOk` tells the UI when persisting failed (for example a full quota).
 */
export type PersistentStore<T> = {
  get: () => T
  set: (next: T | ((previous: T) => T)) => boolean
  reset: () => void
  /** Re-reads storage (used after an import or a "reset all data"). */
  reload: () => void
  subscribe: (listener: () => void) => () => void
  lastWriteOk: () => boolean
}

export function createPersistentStore<T>(options: { key: string; fallback: () => T; sanitize: (raw: unknown) => T }): PersistentStore<T> {
  const { key, fallback, sanitize } = options
  const listeners = new Set<() => void>()
  let writeOk = true

  function load(): T {
    const raw = readJson(key)
    if (raw === undefined) return fallback()
    try {
      return sanitize(raw)
    } catch {
      return fallback()
    }
  }

  let current = load()
  const notify = () => listeners.forEach((listener) => listener())

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === key || event.key === null) {
        current = load()
        notify()
      }
    })
  }

  return {
    get: () => current,
    set(next) {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(current) : next
      current = value
      writeOk = writeJson(key, value)
      notify()
      return writeOk
    },
    reset() {
      current = fallback()
      writeOk = writeJson(key, current)
      notify()
    },
    reload() {
      current = load()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    lastWriteOk: () => writeOk,
  }
}

export function usePersistentStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
