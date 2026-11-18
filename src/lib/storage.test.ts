import { afterEach, describe, expect, it } from 'vitest'
import { appKeys, readJson, readRaw, removeRaw, useStorageBackendForTests, writeJson, writeRaw } from './storage'

class FakeStorage {
  data = new Map<string, string>()
  failWrites = false
  get length() { return this.data.size }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.data.set(key, value)
  }
  removeItem(key: string) { this.data.delete(key) }
}

afterEach(() => useStorageBackendForTests(undefined))

describe('storage wrapper', () => {
  it('round-trips JSON through the backend', () => {
    const fake = new FakeStorage()
    useStorageBackendForTests(fake as unknown as Storage)
    expect(writeJson('chess-unlimited:test', { a: 1 })).toBe(true)
    expect(readJson('chess-unlimited:test')).toEqual({ a: 1 })
    expect(fake.data.get('chess-unlimited:test')).toBe('{"a":1}')
  })

  it('returns undefined for missing or corrupt JSON instead of throwing', () => {
    const fake = new FakeStorage()
    useStorageBackendForTests(fake as unknown as Storage)
    expect(readJson('chess-unlimited:missing')).toBeUndefined()
    fake.data.set('chess-unlimited:bad', '{not json')
    expect(readJson('chess-unlimited:bad')).toBeUndefined()
  })

  it('reports a failed write (full quota) but keeps the value for this tab', () => {
    const fake = new FakeStorage()
    fake.failWrites = true
    useStorageBackendForTests(fake as unknown as Storage)
    expect(writeRaw('chess-unlimited:big', 'x')).toBe(false)
    expect(readRaw('chess-unlimited:big')).toBe('x')
  })

  it('falls back to memory when storage is unavailable', () => {
    useStorageBackendForTests(null)
    expect(writeRaw('chess-unlimited:mem', 'v')).toBe(true)
    expect(readRaw('chess-unlimited:mem')).toBe('v')
    removeRaw('chess-unlimited:mem')
    expect(readRaw('chess-unlimited:mem')).toBeNull()
  })

  it('lists only keys that belong to the app', () => {
    const fake = new FakeStorage()
    useStorageBackendForTests(fake as unknown as Storage)
    fake.data.set('other-app:x', '1')
    writeRaw('chess-unlimited:b', '1')
    writeRaw('chess-unlimited:a', '1')
    expect(appKeys()).toEqual(['chess-unlimited:a', 'chess-unlimited:b'])
  })
})
