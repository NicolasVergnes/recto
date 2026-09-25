import { beforeAll, describe, expect, it } from 'vitest'
import type { SqlJsStatic } from 'sql.js'
import { renderCard } from '$lib/domain/notes'
import { parseOcclusion } from '$lib/domain/occlusion'
import {
  convertModel,
  describePackage,
  isAnkiImageOcclusion,
  planApkgImport,
  readApkg,
  type ApkgExisting,
  type ApkgImportOptions,
  type ApkgPackage,
} from '$lib/import/apkg'
import { sampleBytes } from '../../helpers/samples'

let SQL: SqlJsStatic
beforeAll(async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  SQL = await initSqlJs()
})

const now = Date.UTC(2026, 8, 25, 8)
let seq = 0
const newId = () => `io-${++seq}`
const empty: ApkgExisting = { decks: [], notes: [], media: new Map() }
const options: ApkgImportOptions = {
  target: { mode: 'anki' },
  importHistory: false,
  scheduler: 'fsrs',
  dayStartHour: 4,
}

/** Exported by the real Anki engine (see data/samples/README.md). */
const fixture = (): ApkgPackage => readApkg(sampleBytes('image-occlusion.apkg'), SQL)

describe('Anki image occlusion import', () => {
  it('recognises the native note type by its template', () => {
    const pkg = fixture()
    const io = pkg.models.find(isAnkiImageOcclusion)
    if (!io) throw new Error('no image occlusion model')
    expect(io.fields).toEqual(['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'])
    expect(pkg.models.filter(isAnkiImageOcclusion)).toHaveLength(1)
    expect(convertModel(io)).toMatchObject({
      modelType: 'image_occlusion',
      mergedFields: 1,
      converted: false,
    })
    const summary = describePackage(pkg)
    expect(summary.models.find((m) => m.modelType === 'image_occlusion')).toBeDefined()
  })

  it('imports masks, fields, one card per group and the suspension', async () => {
    const plan = await planApkgImport(fixture(), options, empty, now, newId)
    expect(plan.report.errors).toEqual([])
    expect(plan.notes).toHaveLength(1)
    const note = plan.notes[0]
    if (!note) throw new Error('no note')
    expect(note.modelType).toBe('image_occlusion')
    expect(note.fields[0]).toBe('<img src="carte-france.png">')
    expect(note.fields[2]).toBe('Villes de France')
    expect(note.fields[3]).toBe('Source : IGN<br>Commentaire')
    expect(parseOcclusion(note.fields[1] ?? '')).toEqual({
      mode: 'hideAll',
      masks: [
        { n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.25 },
        { n: 2, x: 0.5, y: 0.5, w: 0.2, h: 0.1 },
        { n: 2, x: 0.7, y: 0.1, w: 0.2, h: 0.2 },
        { n: 3, x: 0.1, y: 0.7, w: 0.2, h: 0.2 },
      ],
    })
    expect(plan.cards.map((c) => [c.ord, c.suspended])).toEqual([
      [0, false],
      [1, false],
      [2, true],
    ])
    expect(plan.report.shapesConverted).toBe(2)
    expect(plan.report.shapesSkipped).toBe(0)
    expect(plan.report.decksCreated).toEqual(['Géographie', 'Cartes'])
    expect(plan.media.map((m) => m.name)).toEqual(['carte-france.png'])
    expect(plan.report.missingMedia).toEqual([])
    const rendered = renderCard(note, { ord: 1, sideFlipped: false })
    expect(rendered.occlusion).toMatchObject({ image: 'carte-france.png', target: 2 })
  })

  it('counts converted shapes only for the notes it writes', async () => {
    const pkg = fixture()
    const first = await planApkgImport(pkg, options, empty, now, newId)
    const again = await planApkgImport(
      pkg,
      options,
      { ...empty, decks: first.decks, notes: first.notes },
      now,
      newId,
    )
    expect(again.notes).toEqual([])
    expect(again.report.skipped).toBe(1)
    expect(again.report.shapesConverted).toBe(0)
  })

  it('reports shapes it cannot read and notes left without masks', async () => {
    const pkg = fixture()
    const [note] = pkg.notes
    if (!note) throw new Error('no note')
    const text =
      '{{c1::image-occlusion:text:left=.1:top=.1:text=Paris:scale=1:fs=.05}}<br>' +
      '{{c2::image-occlusion:rect:left=120:top=40:width=30:height=20}}'
    const broken: ApkgPackage = {
      ...pkg,
      notes: [{ ...note, fields: [text, ...note.fields.slice(1)] }],
    }
    const plan = await planApkgImport(broken, options, empty, now, newId)
    expect(plan.notes).toEqual([])
    expect(plan.report.errors).toEqual([{ line: note.id, code: 'noMask' }])
    expect(plan.report.shapesSkipped).toBe(2)
  })
})
