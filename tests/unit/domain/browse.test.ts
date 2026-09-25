import { describe, expect, it } from 'vitest'
import { buildRow, cardStatus, filterRows, sortRows, type BrowserRow } from '$lib/domain/browse'
import { makeCard } from '$lib/domain/defaults'
import type { Note } from '$lib/domain/types'

function note(
  id: string,
  fields: string[],
  tags: string[] = [],
  modelType: Note['modelType'] = 'basic',
): Note {
  return { id, deckId: 'd1', modelType, fields, tags, createdAt: 0, updatedAt: 0 }
}

describe('card browser', () => {
  const n1 = note('n1', ['<b>Département 10</b>', 'Aube'], ['geo'])
  const n2 = note('n2', ['Département 2', 'Aisne'])
  const n3 = note('n3', ['La {{c1::Lune}}', 'Satellite'], ['astro'], 'cloze')
  const rows: BrowserRow[] = [
    buildRow({ ...makeCard(n1, 0, 'c1', 30), due: 300 }, n1, 'Géo'),
    buildRow({ ...makeCard(n2, 0, 'c2', 20), state: 2, due: 100, flag: 1 }, n2, 'Géo'),
    buildRow(
      { ...makeCard({ ...n3, deckId: 'd2' }, 0, 'c3', 10), suspended: true, due: 200 },
      n3,
      'Astro',
    ),
  ]

  it('computes the display status', () => {
    expect(cardStatus({ state: 3, suspended: false, retired: false })).toBe('relearning')
    expect(cardStatus({ state: 2, suspended: true, retired: true })).toBe('retired')
    expect(rows.map((r) => r.status)).toEqual(['new', 'review', 'suspended'])
    expect(rows[2]).toMatchObject({ question: 'La […]', answer: 'Satellite' })
  })

  it('filters by deck, tag, status, flag and accent-insensitive text', () => {
    const f = { deckIds: null, q: '', tag: '', status: '' as const }
    expect(filterRows(rows, f)).toHaveLength(3)
    expect(filterRows(rows, { ...f, deckIds: ['d2'] }).map((r) => r.card.id)).toEqual(['c3'])
    expect(filterRows(rows, { ...f, tag: 'geo' }).map((r) => r.card.id)).toEqual(['c1'])
    expect(filterRows(rows, { ...f, status: 'review' }).map((r) => r.card.id)).toEqual(['c2'])
    expect(filterRows(rows, { ...f, status: 'flagged' }).map((r) => r.card.id)).toEqual(['c2'])
    expect(filterRows(rows, { ...f, q: 'departement' }).map((r) => r.card.id)).toEqual(['c1', 'c2'])
    expect(filterRows(rows, { ...f, q: 'ASTRO' }).map((r) => r.card.id)).toEqual(['c3'])
  })

  it('sorts naturally in both directions', () => {
    const ids = (rs: BrowserRow[]) => rs.map((r) => r.card.id)
    expect(ids(sortRows(rows, { key: 'question', dir: 1 }))).toEqual(['c2', 'c1', 'c3'])
    expect(ids(sortRows(rows, { key: 'due', dir: -1 }))).toEqual(['c1', 'c3', 'c2'])
    expect(ids(sortRows(rows, { key: 'deck', dir: 1 }))).toEqual(['c3', 'c1', 'c2'])
    expect(ids(sortRows(rows, { key: 'created', dir: 1 }))).toEqual(['c3', 'c2', 'c1'])
    expect(ids(sortRows(rows, { key: 'answer', dir: 1 }))).toEqual(['c2', 'c1', 'c3'])
    expect(ids(sortRows(rows, { key: 'status', dir: 1 }))).toEqual(['c1', 'c2', 'c3'])
  })
})
