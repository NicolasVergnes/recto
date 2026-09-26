import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildApkg } from '$lib/export/apkg'
import { representativeCollection } from '../helpers/apkg-collection'

// Writes the representative collection as an .apkg, at the current time, for check_apkg.py.
// RECTO_APKG_OUT: output file; RECTO_DAY_START: study day start hour (default 4).
it('writes a representative .apkg for the real-Anki check', async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  const SQL = await initSqlJs()
  const now = Date.now()
  const dayStartHour = Number(process.env.RECTO_DAY_START ?? 4)
  const { bytes, report } = await buildApkg(SQL, representativeCollection(now), {
    now,
    dayStartHour,
  })
  const out = resolve(process.env.RECTO_APKG_OUT ?? 'test-results/interop/recto-sample.apkg')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  expect(report).toMatchObject({ notes: 6, cards: 8, reviews: 15, media: 2 })
})
