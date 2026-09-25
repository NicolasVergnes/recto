import { beforeAll, describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import type { SqlJsStatic } from 'sql.js'
import { applyImportPlan, existingForApkg } from '$lib/db/importer'
import { planApkgImport, readApkg } from '$lib/import/apkg'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()
let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await (await import('sql.js/dist/sql-wasm.js')).default()
})

/** A legacy package with `n` basic notes, reviews and one parent/child deck. */
function buildPackage(n: number): Uint8Array {
  const db = new SQL.Database()
  db.run(`CREATE TABLE col (crt INTEGER, models TEXT, decks TEXT);
    CREATE TABLE notes (id INTEGER, guid TEXT, mid INTEGER, mod INTEGER, tags TEXT, flds TEXT);
    CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER);
    CREATE TABLE revlog (id INTEGER, cid INTEGER, ease INTEGER, ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER);`)
  const models = {
    1: {
      name: 'Basic (and reversed card)',
      type: 0,
      flds: [
        { name: 'Front', ord: 0 },
        { name: 'Back', ord: 1 },
      ],
      tmpls: [
        { name: 'Card 1', ord: 0, qfmt: '{{Front}}' },
        { name: 'Card 2', ord: 1, qfmt: '{{Back}}' },
      ],
    },
  }
  const decks = { 1: { name: 'Default' }, 2: { name: 'Langues::Anglais' } }
  db.run('INSERT INTO col VALUES (?, ?, ?)', [
    1600000000,
    JSON.stringify(models),
    JSON.stringify(decks),
  ])
  const notes = db.prepare('INSERT INTO notes VALUES (?, ?, 1, 1600000000, ?, ?)')
  const cards = db.prepare('INSERT INTO cards VALUES (?, ?, 2, ?, ?, ?, ?, ?, 2500, ?, 0)')
  const revs = db.prepare('INSERT INTO revlog VALUES (?, ?, 3, 1, 0, 2500, 4000, ?)')
  for (let i = 0; i < n; i++) {
    const nid = 1600000000000 + i
    notes.run([nid, `g${i}`, ' en vocab ', `word ${i}\u001fmot ${i}`])
    for (const ord of [0, 1]) {
      const cid = 1700000000000 + i * 2 + ord
      const reviewed = i % 3 === 0
      cards.run([
        cid,
        nid,
        ord,
        reviewed ? 2 : 0,
        reviewed ? 2 : 0,
        reviewed ? 10 : i,
        reviewed ? 3 : 0,
        reviewed ? 2 : 0,
      ])
      if (reviewed) {
        revs.run([1600000000000 + i * 1000 + ord, cid, 0])
        revs.run([1600086400000 + i * 1000 + ord, cid, 1])
      }
    }
  }
  notes.free()
  cards.free()
  revs.free()
  const bytes = zipSync({ 'collection.anki21': db.export(), media: strToU8('{}') })
  db.close()
  return bytes
}

describe('large .apkg (≥ 1 000 cards, 07-ROADMAP M4)', () => {
  it('imports 5 000 notes / 10 000 cards with history in batches', async () => {
    const t0 = performance.now()
    const pkg = readApkg(buildPackage(5000), SQL)
    expect(pkg.cards).toHaveLength(10_000)
    const plan = await planApkgImport(
      pkg,
      { target: { mode: 'anki' }, importHistory: true, scheduler: 'fsrs', dayStartHour: 4 },
      await existingForApkg(),
      Date.UTC(2026, 8, 25),
      () => crypto.randomUUID(),
    )
    const batches: number[] = []
    const report = await applyImportPlan(plan, { onProgress: (done) => batches.push(done) })
    expect(report).toMatchObject({ notesCreated: 5000, cardsCreated: 10_000 })
    expect(report.reviewsImported).toBe(1667 * 2 * 2)
    expect(batches).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000])
    expect(await env.db.cards.count()).toBe(10_000)
    expect((await env.db.decks.toArray()).map((d) => d.name).sort()).toEqual(['Anglais', 'Langues'])
    expect(performance.now() - t0).toBeLessThan(60_000)
  }, 120_000)
})
