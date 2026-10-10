import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildApkg } from '$lib/export/apkg'
import { customTypeCollection } from '../helpers/apkg-collection'
import { expectations } from './expected'

// Writes a collection of custom notes (M8: 4 fields, 3 card templates with a section and a typed
// answer, a note whose second template makes no card, history, a suspended card, FSRS and Memory
// Box decks) as an .apkg for check_apkg.py, and next to it `…-expected.json`: the counts and the
// sides Recto renders, which `check_apkg.py --expect` compares with Anki's.
// RECTO_APKG_OUT: output file (default test-results/interop/recto-custom.apkg).
it('writes a custom note type .apkg for the real-Anki check', async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  const SQL = await initSqlJs()
  const now = Date.now()
  const input = customTypeCollection(now)
  const { bytes, report } = await buildApkg(SQL, input, { now, dayStartHour: 4 })
  const out = resolve(process.env.RECTO_APKG_OUT ?? 'test-results/interop/recto-custom.apkg')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  const expected = expectations(input, report)
  writeFileSync(out.replace(/\.apkg$/, '-expected.json'), JSON.stringify(expected, null, 1))

  expect(report).toMatchObject({ notes: 4, cards: 11, reviews: input.reviews.length, media: 0 })
  // « sempiternel » has no example: no card for the section template (ord 1).
  expect(expected.cards_by_ord).toEqual({ '0': 4, '1': 3, '2': 4 })
  expect(expected.questions.find((q) => q.front === 'sempiternel' && q.ord === 1)).toBeUndefined()
  expect(expected.questions.find((q) => q.front === 'ubiquité' && q.ord === 2)?.question).toBe(
    'Fait d’être présent partout à la fois<br>',
  )
})
