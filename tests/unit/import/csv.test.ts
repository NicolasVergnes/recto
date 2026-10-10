import { describe, expect, it } from 'vitest'
import { makeDeck } from '$lib/domain/defaults'
import type { Note, NoteType } from '$lib/domain/types'
import {
  defaultMapping,
  detectModelType,
  headerNamesFields,
  MAX_CSV_ROWS,
  parseCsv,
  planCsvImport,
  type CsvImportOptions,
  type ExistingCollection,
} from '$lib/import/csv'
import { sampleText } from '../../helpers/samples'

const now = Date.UTC(2026, 8, 25)
let seq = 0
const newId = () => `id-${++seq}`
const target = makeDeck({ name: 'Import' }, 'target', now)
const empty: ExistingCollection = { decks: [target], notes: [], mediaNames: new Set() }

function options(
  data: ReturnType<typeof parseCsv>,
  patch: Partial<CsvImportOptions> = {},
): CsvImportOptions {
  const mapping = defaultMapping(data)
  return {
    mapping,
    hasHeader: data.headerDetected,
    modelType: detectModelType(data, mapping, data.headerDetected),
    deckId: 'target',
    duplicates: 'skip',
    ...patch,
  }
}

describe('parseCsv', () => {
  it('reads departements.csv: « ; », BOM, header, deck column', () => {
    const data = parseCsv(sampleText('departements.csv'))
    expect(data.delimiter).toBe(';')
    expect(data.headerDetected).toBe(true)
    expect(data.rows[0]).toEqual(['recto', 'verso', 'extra', 'tags', 'deck'])
    expect(data.rows).toHaveLength(102)
    expect(defaultMapping(data)).toEqual(['front', 'back', 'extra', 'tags', 'deck'])
  })

  it('reads drapeaux.csv: tabs and escaped quotes', () => {
    const data = parseCsv(sampleText('drapeaux.csv'))
    expect(data.delimiter).toBe('\t')
    expect(data.rows[1]?.[0]).toBe('<img src="flag-fr.svg">')
    expect(defaultMapping(data)).toEqual(['front', 'back', 'tags'])
  })

  it('reads cloze.csv: commas, quoted fields', () => {
    const data = parseCsv(sampleText('cloze.csv'))
    expect(data.delimiter).toBe(',')
    const mapping = defaultMapping(data)
    expect(mapping).toEqual(['front', 'extra', 'tags'])
    expect(detectModelType(data, mapping, true)).toBe('cloze')
  })

  it('maps positionally without header and handles CRLF', () => {
    const data = parseCsv('a;b;c;d\r\ne;f;g;h\r\n\r\n')
    expect(data.headerDetected).toBe(false)
    expect(data.rows).toHaveLength(2)
    expect(defaultMapping(data)).toEqual(['front', 'back', 'extra', 'ignore'])
    expect(defaultMapping(data, true)).toEqual(['ignore', 'ignore', 'ignore', 'ignore'])
    expect(detectModelType(data, ['front'], false)).toBe('basic')
  })

  it('ignores duplicated named columns', () => {
    const data = parseCsv('recto,front,Tags\nx,y,z')
    expect(defaultMapping(data)).toEqual(['front', 'ignore', 'tags'])
  })
})

describe('planCsvImport', () => {
  it('imports the 101 departements into Géographie::Départements', () => {
    const data = parseCsv(sampleText('departements.csv'))
    const plan = planCsvImport(data, options(data), empty, now, newId)
    expect(plan.report.errors).toEqual([])
    expect(plan.notes).toHaveLength(101)
    expect(plan.cards).toHaveLength(101)
    expect(plan.decks.map((d) => d.name)).toEqual(['Géographie', 'Départements'])
    const [geo, dep] = plan.decks
    expect(dep?.parentId).toBe(geo?.id)
    expect(plan.notes.every((n) => n.deckId === dep?.id)).toBe(true)
    expect(plan.notes[0]).toMatchObject({
      modelType: 'basic',
      fields: ['Département 01', 'Ain', 'Préfecture : Bourg-en-Bresse'],
      tags: ['geographie', 'france', 'departements'],
    })
    expect(plan.report).toMatchObject({
      notesCreated: 101,
      cardsCreated: 101,
      decksCreated: ['Géographie', 'Départements'],
    })
  })

  it('keeps flag references and reports the 10 missing media', () => {
    const data = parseCsv(sampleText('drapeaux.csv'))
    const plan = planCsvImport(data, options(data), empty, now, newId)
    expect(plan.notes).toHaveLength(11)
    expect(plan.notes[0]?.fields[0]).toBe('<img src="flag-fr.svg">')
    expect(plan.report.missingMedia).toHaveLength(10)
    expect(plan.report.missingMedia).toContain('flag-fr.svg')
    const known = planCsvImport(
      data,
      options(data),
      { ...empty, mediaNames: new Set(['flag-fr.svg']) },
      now,
      newId,
    )
    expect(known.report.missingMedia).toHaveLength(9)
  })

  it('detects cloze notes: 5 notes, 9 cards, hint kept', () => {
    const data = parseCsv(sampleText('cloze.csv'))
    const plan = planCsvImport(data, options(data), empty, now, newId)
    expect(plan.notes).toHaveLength(5)
    expect(plan.cards).toHaveLength(9)
    expect(plan.notes.every((n) => n.modelType === 'cloze')).toBe(true)
    expect(plan.notes[1]?.fields[0]).toContain('{{c1::Pythagore::mathématicien grec}}')
    expect(plan.notes[0]?.fields).toEqual([
      'La {{c1::Lune}} tourne autour de la {{c2::Terre}} en environ {{c3::27,3 jours}}.',
      'Période sidérale',
    ])
  })

  it('merges a back column into extra for cloze and honours basic_reverse', () => {
    const data = parseCsv('Le {{c1::chat}};miaou;félin\nchien;dog;')
    const plan = planCsvImport(
      data,
      { ...options(data), modelType: 'basic_reverse' },
      empty,
      now,
      newId,
    )
    expect(plan.notes[0]).toMatchObject({
      modelType: 'cloze',
      fields: ['Le {{c1::chat}}', 'félin<br>miaou'],
    })
    expect(plan.notes[1]).toMatchObject({
      modelType: 'basic_reverse',
      fields: ['chien', 'dog', ''],
    })
    expect(plan.cards).toHaveLength(3)
  })

  it('uses a type column when present (CSV export round trip)', () => {
    const data = parseCsv(
      'Recto;Verso;Extra;Tags;Paquet;Type\nchien;dog;;;;basic_reverse\n{{c1::x}};;;;;cloze\na;b;;;;inconnu',
    )
    const opts = { ...options(data), modelType: 'basic' as const }
    expect(opts.mapping).toEqual(['front', 'back', 'extra', 'tags', 'deck', 'type'])
    const plan = planCsvImport(data, opts, empty, now, newId)
    expect(plan.notes.map((n) => n.modelType)).toEqual(['basic_reverse', 'cloze', 'basic'])
  })

  it('reports errors with their line numbers', () => {
    const data = parseCsv('recto;verso\n;vide\n{{c1::}};x\nok;ok\n')
    const plan = planCsvImport(data, { ...options(data), modelType: 'cloze' }, empty, now, newId)
    expect(plan.report.errors).toEqual([
      { line: 2, code: 'emptyFront' },
      { line: 4, code: 'noCloze' },
    ])
    expect(plan.notes).toHaveLength(1)
  })

  it('refuses empty files and files over 50 000 rows', () => {
    expect(
      planCsvImport(parseCsv(''), options(parseCsv('')), empty, now, newId).report.errors,
    ).toEqual([{ line: 0, code: 'emptyFile' }])
    const big = parseCsv(Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => `q${i};a`).join('\n'))
    const plan = planCsvImport(big, options(big), empty, now, newId)
    expect(plan.report.errors).toEqual([{ line: 0, code: 'tooManyRows' }])
    expect(plan.notes).toHaveLength(0)
  })

  it('handles duplicates: skip, update, duplicate (existing and within the file)', () => {
    const existingNote: Note = {
      id: 'old',
      deckId: 'target',
      modelType: 'basic',
      fields: ['<b>Chien</b>', 'old', 'old extra'],
      tags: ['x'],
      createdAt: 1,
      updatedAt: 1,
    }
    const collection = { ...empty, notes: [existingNote] }
    const data = parseCsv(
      'recto;verso;extra;tags\nchien;dog;e;animal\nchat;cat;;\nCHAT;kitty;;chat',
    )
    const skip = planCsvImport(data, options(data), collection, now, newId)
    expect(skip.report).toMatchObject({ skipped: 2, notesCreated: 1 })
    const update = planCsvImport(
      data,
      { ...options(data), duplicates: 'update' },
      collection,
      now,
      newId,
    )
    expect(update.updates).toEqual([
      { ...existingNote, fields: ['<b>Chien</b>', 'dog', 'e'], tags: ['animal'], updatedAt: now },
    ])
    expect(update.notes).toHaveLength(1)
    expect(update.notes[0]).toMatchObject({ fields: ['chat', 'kitty', ''], tags: ['chat'] })
    expect(update.report.notesUpdated).toBe(1)
    const dup = planCsvImport(
      data,
      { ...options(data), duplicates: 'duplicate' },
      collection,
      now,
      newId,
    )
    expect(dup.notes).toHaveLength(3)
    const clozeExisting = {
      ...existingNote,
      modelType: 'cloze' as const,
      fields: ['{{c1::chien}}', 'x'],
    }
    const data2 = parseCsv('{{c1::chien}};;nouvel extra')
    const upd2 = planCsvImport(
      data2,
      { ...options(data2), duplicates: 'update' },
      { ...empty, notes: [clozeExisting] },
      now,
      newId,
    )
    expect(upd2.updates[0]?.fields).toEqual(['{{c1::chien}}', 'nouvel extra'])
    // An occlusion note on the same image is never a CSV duplicate (its masks would be lost).
    const occlusion: Note = {
      ...existingNote,
      modelType: 'image_occlusion',
      fields: ['<img src="carte.png">', '{"v":1,"mode":"hideAll","masks":[]}', '', ''],
    }
    const data3 = parseCsv('<img src="carte.png">;Paris;')
    const upd3 = planCsvImport(
      data3,
      { ...options(data3), duplicates: 'update' },
      { ...empty, notes: [occlusion] },
      now,
      newId,
    )
    expect(upd3.updates).toEqual([])
    expect(upd3.notes).toHaveLength(1)
  })

  it('reuses existing decks by path and counts remote images', () => {
    const geo = makeDeck({ name: 'Géographie' }, 'g', now)
    const data = parseCsv('recto;verso;deck\n<img src="https://x.org/a.png">;a;géographie\nb;b;')
    const plan = planCsvImport(data, options(data), { ...empty, decks: [target, geo] }, now, newId)
    expect(plan.decks).toEqual([])
    expect(plan.notes.map((n) => n.deckId)).toEqual(['g', 'target'])
    expect(plan.report.remoteMedia).toBe(1)
    expect(plan.report.missingMedia).toEqual([])
  })
})

describe('planCsvImport, more duplicates', () => {
  it('updates a note created earlier in the same file', () => {
    const data = parseCsv('recto;verso\nchien;dog\nChien;hound')
    const plan = planCsvImport(data, { ...options(data), duplicates: 'update' }, empty, now, newId)
    expect(plan.notes).toHaveLength(1)
    expect(plan.notes[0]?.fields).toEqual(['chien', 'hound', ''])
    expect(plan.cards).toHaveLength(1)
    expect(plan.updates).toEqual([])
  })

  it('works without a front mapping index for optional columns', () => {
    const data = parseCsv('a;b')
    const plan = planCsvImport(
      data,
      { ...options(data), mapping: ['front', 'ignore'] },
      empty,
      now,
      newId,
    )
    expect(plan.notes[0]?.fields).toEqual(['a', '', ''])
    expect(detectModelType(parseCsv('x'), ['ignore'], false)).toBe('basic')
  })
})

describe('fallback deck', () => {
  it('creates the new deck only when a row has no deck', () => {
    const withDeck = parseCsv('recto;deck\na;Langues')
    const p1 = planCsvImport(
      withDeck,
      { ...options(withDeck), deckId: '', newDeckName: 'Neuf' },
      empty,
      now,
      newId,
    )
    expect(p1.decks.map((d) => d.name)).toEqual(['Langues'])
    const without = parseCsv('recto;deck\na;')
    const p2 = planCsvImport(
      without,
      { ...options(without), deckId: '', newDeckName: 'Neuf' },
      empty,
      now,
      newId,
    )
    expect(p2.decks.map((d) => d.name)).toEqual(['Neuf'])
    // Default name « Import »: here an existing deck of that name is reused.
    const p3 = planCsvImport(without, { ...options(without), deckId: '' }, empty, now, newId)
    expect(p3.decks).toEqual([])
    expect(p3.notes[0]?.deckId).toBe('target')
  })
})

describe('custom note types (M10)', () => {
  const type: NoteType = {
    id: 'dept',
    name: 'Departements',
    fields: ['Numero', 'Dept', 'Carte'],
    templates: [
      {
        name: 'QNumero',
        front: 'Numéro {{Numero}} ?',
        back: '{{FrontSide}}<hr id=answer>{{Dept}}',
      },
      { name: 'QDept', front: 'Numéro de {{Dept}} ?', back: '{{Numero}}' },
      { name: 'Qcarte', front: '{{#Carte}}{{Carte}}{{/Carte}}', back: '{{Dept}}' },
    ],
    createdAt: now,
    updatedAt: now,
  }
  const csv = (text: string) => parseCsv(text)
  const custom = (data: ReturnType<typeof parseCsv>, patch: Partial<CsvImportOptions> = {}) => {
    const hasHeader = headerNamesFields(data, type)
    return {
      mapping: defaultMapping(data, hasHeader, type),
      hasHeader,
      modelType: 'custom' as const,
      noteType: type,
      deckId: 'target',
      duplicates: 'skip' as const,
      ...patch,
    }
  }
  const existingNote = (fields: string[], patch: Partial<Note> = {}): Note => ({
    id: 'old',
    deckId: 'target',
    modelType: 'custom',
    noteTypeId: type.id,
    fields,
    tags: ['vieux'],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  })

  it('maps a header naming the fields, in any order, and makes one card per template', () => {
    const data = csv('Dept;Numero;tags\nAin;01;geo\nAisne;02;\n')
    expect(headerNamesFields(data, type)).toBe(true)
    expect(defaultMapping(data, true, type)).toEqual(['field:1', 'field:0', 'tags'])
    const plan = planCsvImport(data, custom(data), empty, now, newId)
    expect(plan.report.errors).toEqual([])
    expect(plan.notes.map((n) => [n.modelType, n.noteTypeId, n.fields, n.tags])).toEqual([
      ['custom', 'dept', ['01', 'Ain', ''], ['geo']],
      ['custom', 'dept', ['02', 'Aisne', ''], []],
    ])
    // No « Carte »: no card for the section template.
    expect(plan.cards.map((c) => [c.noteId, c.ord])).toEqual([
      [plan.notes[0]?.id, 0],
      [plan.notes[0]?.id, 1],
      [plan.notes[1]?.id, 0],
      [plan.notes[1]?.id, 1],
    ])
  })

  it('maps positionally without header and reports empty first fields and cardless rows', () => {
    const data = csv('01,Ain,<img src="ain.png">\n,Aisne,\n')
    expect(defaultMapping(data, false, type)).toEqual(['field:0', 'field:1', 'field:2'])
    const plan = planCsvImport(data, custom(data), empty, now, newId)
    expect(plan.notes).toHaveLength(1)
    expect(plan.cards).toHaveLength(3)
    expect(plan.report.errors).toEqual([{ line: 2, code: 'emptyFront' }])
    const cardless: NoteType = {
      ...type,
      templates: [{ name: 'Q', front: '{{Carte}}', back: '{{Dept}}' }],
    }
    const none = planCsvImport(
      csv('01;Ain\n'),
      { ...custom(csv('01;Ain\n')), noteType: cardless },
      empty,
      now,
      newId,
    )
    expect(none.report.errors).toEqual([{ line: 1, code: 'noCard' }])
  })

  it('updates the notes of the same type only: mapped fields replaced, cards reconciled', () => {
    const old = existingNote(['01', 'Ain', 'vieille carte'])
    const cards = [0, 1, 2].map((ord) => ({
      id: `c${ord}`,
      noteId: 'old',
      ord,
      lastReview: 5,
      reps: 2,
    }))
    const builtIn: Note = { ...old, id: 'basic', modelType: 'basic', fields: ['01', 'x', ''] }
    delete builtIn.noteTypeId
    const existing: ExistingCollection = { ...empty, notes: [old, builtIn], cards }
    // « Carte » emptied: its card goes, the others stay with their schedule.
    const data = csv('Numero;Carte\n01;\n')
    const plan = planCsvImport(data, custom(data, { duplicates: 'update' }), existing, now, newId)
    expect(plan.notes).toEqual([])
    expect(plan.updates.map((n) => [n.id, n.fields, n.tags])).toEqual([
      ['old', ['01', 'Ain', ''], []],
    ])
    expect(plan.removedCards).toEqual([{ id: 'c2', noteId: 'old' }])
    expect(plan.cards).toEqual([])
    // And back: a card is created for the template that asks again.
    const again = csv('Numero;Carte\n01;nouvelle\n')
    const back = planCsvImport(
      again,
      custom(again, { duplicates: 'update' }),
      { ...existing, notes: [{ ...old, fields: ['01', 'Ain', ''] }], cards: cards.slice(0, 2) },
      now,
      newId,
    )
    expect(back.cards.map((c) => [c.noteId, c.ord, c.deckId])).toEqual([['old', 2, 'target']])
    expect(back.removedCards).toEqual([])
  })

  it('never lets a built-in row update a custom note (regression, M10)', () => {
    const old = existingNote(['Capitale de la France', 'Paris', '', ''])
    const existing: ExistingCollection = { ...empty, notes: [old] }
    const data = csv('Capitale de la France;Lyon;\n')
    for (const duplicates of ['skip', 'update', 'duplicate'] as const) {
      const plan = planCsvImport(data, options(data, { duplicates }), existing, now, newId)
      expect(plan.updates).toEqual([])
      expect(plan.notes.map((n) => n.modelType)).toEqual(['basic'])
    }
  })
})
