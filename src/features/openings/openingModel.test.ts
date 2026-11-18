import { describe, expect, it } from 'vitest'
import { OPENING_BOOK } from './openingData'
import { BOOK_SIZE, bookDepth, detectOpening, formatLine, nextBookMoves, openingAt, sanPath, searchOpenings } from './openingModel'

const line = (text: string) => text.split(' ')

describe('opening book data', () => {
  it('has unique lines and well-formed entries', () => {
    expect(BOOK_SIZE).toBeGreaterThan(150)
    const seen = new Set<string>()
    for (const entry of OPENING_BOOK) {
      expect(entry.eco).toMatch(/^[A-E]\d\d$/)
      expect(entry.name.length).toBeGreaterThan(2)
      expect(entry.uci.split(' ')).toHaveLength(entry.san.split(' ').length)
      expect(entry.uci.split(' ').every((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))).toBe(true)
      expect(seen.has(entry.uci)).toBe(false)
      seen.add(entry.uci)
    }
  })
})

describe('opening detection', () => {
  it('finds the most specific line that matches the start of a game', () => {
    expect(detectOpening(line('e2e4 e7e5 g1f3 b8c6 f1c4'))).toMatchObject({ eco: 'C50', name: 'Italian Game', plies: 5 })
    const ruy = detectOpening(line('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7'))
    expect(ruy?.name).toBe('Ruy Lopez: Closed Variation')
    expect(ruy?.plies).toBe(10)
  })

  it('keeps the last book name when the game leaves the book', () => {
    const match = detectOpening(line('e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 h2h3 h7h6 a2a3'))
    expect(match?.name).toBe('Sicilian Defense: Najdorf Variation')
    expect(match?.plies).toBe(10)
  })

  it('returns null when even the first move is not in the book', () => {
    expect(detectOpening(line('a2a3 e7e5'))).toBeNull()
    expect(detectOpening([])).toBeNull()
  })

  it('names a position only when it is the end of a book line', () => {
    expect(openingAt(line('e2e4 c7c5'))?.name).toBe('Sicilian Defense')
    expect(openingAt(line('e2e4 c7c5 b1c3 b8c6 g2g3'))).toBeNull()
  })

  it('measures how long a game stays in the book', () => {
    expect(bookDepth(line('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 a2a3'))).toBe(6)
    expect(bookDepth(line('h2h4'))).toBe(0)
    expect(bookDepth([])).toBe(0)
  })

  it('gives SAN for a book path and null off the book', () => {
    expect(sanPath(line('e2e4 e7e5 g1f3'))).toEqual(['e4', 'e5', 'Nf3'])
    expect(sanPath(line('h2h4'))).toBeNull()
    expect(sanPath([])).toEqual([])
  })
})

describe('opening explorer helpers', () => {
  it('lists the first moves with the most explored ideas first', () => {
    const first = nextBookMoves([])
    expect(first[0].uci).toBe('e2e4')
    expect(first.map((item) => item.san)).toEqual(expect.arrayContaining(['e4', 'd4', 'c4', 'Nf3']))
    expect(first.find((item) => item.uci === 'g2g4')?.named[0].name).toBe('Grob Opening')
  })

  it('continues after e4 e5 with named replies', () => {
    const replies = nextBookMoves(line('e2e4 e7e5'))
    const knight = replies.find((item) => item.san === 'Nf3')
    expect(knight?.lines).toBeGreaterThan(10)
    expect(knight?.named[0].name).toBe("King's Knight Opening")
    expect(nextBookMoves(line('h2h4'))).toEqual([])
  })

  it('searches names without caring about accents, and ECO codes', () => {
    expect(searchOpenings('grunfeld')[0].name).toContain('Grünfeld')
    expect(searchOpenings('B90')[0].name).toBe('Sicilian Defense: Najdorf Variation')
    expect(searchOpenings('')).toEqual([])
    expect(searchOpenings('zzzzzz')).toEqual([])
  })

  it('formats numbered lines', () => {
    expect(formatLine(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3')
    expect(formatLine([])).toBe('')
  })
})
