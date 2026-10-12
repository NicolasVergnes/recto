import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeDeck } from '$lib/domain/defaults'
import {
  defaultMapping,
  detectModelType,
  parseCsv,
  planCsvImport,
  type ExistingCollection,
} from '$lib/import/csv'

// The examples of the Claude plugin (tools/deck-builder) must stay importable by Recto.
const dir = resolve(process.cwd(), 'tools/deck-builder/skills/deck-builder/examples')
const now = Date.UTC(2026, 9, 13)
const target = makeDeck({ name: 'Import' }, 'target', now)
const empty: ExistingCollection = { decks: [target], notes: [], mediaNames: new Set() }

function plan(name: string) {
  const data = parseCsv(readFileSync(resolve(dir, name), 'utf8'))
  const mapping = defaultMapping(data)
  let seq = 0
  return planCsvImport(
    data,
    {
      mapping,
      hasHeader: data.headerDetected,
      modelType: detectModelType(data, mapping, data.headerDetected),
      deckId: 'target',
      duplicates: 'skip',
    },
    empty,
    now,
    () => `id-${++seq}`,
  )
}

describe('plugin deck-builder: examples', () => {
  it('basique.csv: 3 basic notes, nested decks, no error', () => {
    const p = plan('basique.csv')
    expect(p.report.errors).toEqual([])
    expect(p.notes.map((n) => n.modelType)).toEqual(['basic', 'basic', 'basic'])
    expect(p.notes[2]?.fields[1]).toBe('\\(E_c = \\tfrac{1}{2} m v^2\\)')
    // « A::B » creates the parent and the sub-deck.
    expect(p.report.decksCreated.sort()).toEqual([
      'Capitales',
      'Géographie',
      'Physique',
      'Sciences',
    ])
    expect(p.report.missingMedia).toEqual([])
  })

  it('cloze.csv: 2 notes, one card per cloze number', () => {
    const p = plan('cloze.csv')
    expect(p.report.errors).toEqual([])
    expect(p.notes.map((n) => n.modelType)).toEqual(['cloze', 'cloze'])
    expect(p.cards).toHaveLength(4)
    expect(p.notes[0]?.tags).toEqual(['biologie', 'cellule'])
  })

  it('mixte.csv: the type column mixes basic and cloze', () => {
    const p = plan('mixte.csv')
    expect(p.report.errors).toEqual([])
    expect(p.notes.map((n) => n.modelType)).toEqual(['basic', 'cloze'])
  })
})
