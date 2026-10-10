import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildApkg, type ApkgExportInput } from '$lib/export/apkg'
import { planApkgImport, readApkg } from '$lib/import/apkg'
import { expectations } from './expected'

// Round trip of a real package (RECTO_REAL_APKG: « Les départements français » from AnkiWeb,
// 101 notes, 404 cards, one note type with 5 fields and 4 templates, 101 images; never copied into
// the repository). The package is read like the app reads it, planned as an import into an empty
// Recto collection (the app's default options), then exported again as Recto would export that
// collection, to `recto-departements.apkg` (RECTO_APKG_OUT) and its `…-expected.json`.
// `check_apkg.py --base $RECTO_REAL_APKG` then imports it over the original package.
const real = process.env.RECTO_REAL_APKG

it.skipIf(!real)('round-trips the real « Les départements français » package', async () => {
  const path = resolve(real ?? '')
  if (!existsSync(path)) throw new Error(`RECTO_REAL_APKG does not exist: ${path}`)
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  const SQL = await initSqlJs()
  const now = Date.now()
  let seq = 0
  const newId = () => `id-${++seq}`

  const pkg = readApkg(new Uint8Array(readFileSync(path)), SQL)
  expect(pkg.models.map((m) => [m.name, m.fields.length, m.templates.length])).toEqual([
    ['Departements', 5, 4],
  ])
  const plan = await planApkgImport(
    pkg,
    {
      target: { mode: 'anki' },
      importHistory: pkg.revlog.length > 0,
      scheduler: 'fsrs',
      dayStartHour: 4,
    },
    { decks: [], notes: [], noteTypes: [], cards: [], media: new Map() },
    now,
    newId,
  )

  // What Recto holds after the import: 101 notes of one custom type, one card per template.
  expect(plan.report.errors).toEqual([])
  expect(plan.notes).toHaveLength(101)
  expect(plan.cards).toHaveLength(404)
  expect(plan.noteTypes).toHaveLength(1)
  expect(plan.noteTypes?.[0]?.fields).toHaveLength(5)
  expect(plan.noteTypes?.[0]?.templates).toHaveLength(4)
  expect(plan.media).toHaveLength(101)

  const input: ApkgExportInput = {
    decks: plan.decks,
    notes: plan.notes,
    cards: plan.cards,
    reviews: plan.reviews,
    media: await Promise.all(
      plan.media.map(async (m) => ({
        name: m.name,
        data: new Uint8Array(await m.blob.arrayBuffer()),
      })),
    ),
    noteTypes: plan.noteTypes ?? [],
  }
  const { bytes, report } = await buildApkg(SQL, input, { now, dayStartHour: 4 })
  const out = resolve(process.env.RECTO_APKG_OUT ?? 'test-results/interop/recto-departements.apkg')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  const expected = expectations(input, report)
  writeFileSync(out.replace(/\.apkg$/, '-expected.json'), JSON.stringify(expected, null, 1))

  expect(report).toMatchObject({ notes: 101, cards: 404, media: 101, reviews: 0, missingMedia: [] })
  expect(expected.cards_by_ord).toEqual({ '0': 101, '1': 101, '2': 101, '3': 101 })
})
