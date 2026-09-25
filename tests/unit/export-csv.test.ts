import { describe, expect, it } from 'vitest'
import { makeDeck } from '$lib/domain/defaults'
import type { Note } from '$lib/domain/types'
import { notesToCsv } from '$lib/export/csv'
import { defaultMapping, parseCsv, planCsvImport } from '$lib/import/csv'

const note = (
  id: string,
  modelType: Note['modelType'],
  fields: string[],
  tags: string[] = [],
): Note => ({
  id,
  deckId: 'd',
  modelType,
  fields,
  tags,
  createdAt: 0,
  updatedAt: 0,
})

describe('CSV export', () => {
  const rows = [
    {
      note: note('a', 'basic', ['Chien', 'Dog; "wouf"', 'extra\nligne'], ['animal', 'en']),
      deckPath: 'Langues::Anglais',
    },
    { note: note('b', 'basic_reverse', ['Chat', 'Cat', '']), deckPath: 'Langues::Anglais' },
    { note: note('c', 'cloze', ['La {{c1::Lune}}', 'satellite']), deckPath: 'Astro' },
    { note: note('d', 'basic', ['<img src="flag-fr.svg">', 'France', '']), deckPath: 'Astro' },
  ]

  it('writes a BOM, a header, CRLF and escaped quotes', () => {
    const csv = notesToCsv(rows, ';')
    expect(csv.startsWith('\ufeffRecto;Verso;Extra;Tags;Paquet;Type\r\n')).toBe(true)
    expect(csv).toContain('"Dog; ""wouf"""')
    expect(notesToCsv(rows, '\t')).toContain('Recto\tVerso')
  })

  it('round-trips through the CSV importer (fields, tags, decks, types)', () => {
    for (const delimiter of [';', '\t'] as const) {
      const data = parseCsv(notesToCsv(rows, delimiter))
      expect(data.delimiter).toBe(delimiter)
      const mapping = defaultMapping(data)
      let n = 0
      const plan = planCsvImport(
        data,
        { mapping, hasHeader: true, modelType: 'basic', deckId: 'x', duplicates: 'duplicate' },
        { decks: [makeDeck({ name: 'Astro' }, 'astro', 0)], notes: [], mediaNames: new Set() },
        1,
        () => `n${++n}`,
      )
      expect(plan.report.errors).toEqual([])
      expect(plan.notes.map((x) => [x.modelType, x.fields, x.tags])).toEqual(
        rows.map((r) => [r.note.modelType, r.note.fields, r.note.tags]),
      )
      expect(plan.decks.map((d) => d.name)).toEqual(['Langues', 'Anglais'])
      expect(plan.notes[2]?.deckId).toBe('astro')
    }
  })
})
