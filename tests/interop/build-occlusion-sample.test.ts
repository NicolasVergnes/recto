import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { unzipSync } from 'fflate'
import { expect, it } from 'vitest'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import { cardOrds } from '$lib/domain/notes'
import type { Note } from '$lib/domain/types'
import { buildApkg } from '$lib/export/apkg'

// Writes an image occlusion note as an .apkg for check_apkg.py (Anki's own note type).
// RECTO_APKG_OUT: output file (default test-results/interop/recto-occlusion.apkg).
it('writes an image occlusion .apkg for the real-Anki check', async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  const SQL = await initSqlJs()
  const now = Date.now()
  // A real 64 × 48 PNG: the image of the fixture exported by Anki.
  const fixture = unzipSync(new Uint8Array(readFileSync('data/samples/image-occlusion.apkg')))
  const png = fixture['0']
  if (!png) throw new Error('fixture image missing')
  const deck = makeDeck({ name: 'Cartes' }, 'deck-io', now)
  const masks = JSON.stringify({
    v: 1,
    mode: 'hideAll',
    masks: [
      { n: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.25, label: 'Paris' },
      { n: 2, x: 0.5, y: 0.5, w: 0.25, h: 0.125 },
      { n: 2, x: 0, y: 0, w: 0.05, h: 0.05, label: 'Lyon' },
      { n: 4, x: 0.6, y: 0.1, w: 0.3, h: 0.2 },
    ],
  })
  const note: Note = {
    id: 'io-note',
    deckId: deck.id,
    modelType: 'image_occlusion',
    fields: ['<img src="carte-france.png" alt="Carte">', masks, 'Villes', 'Source : IGN'],
    tags: ['carte'],
    createdAt: now,
    updatedAt: now,
  }
  const cards = cardOrds(note.modelType, note.fields).map((ord) =>
    makeCard(note, ord, `io-card-${ord}`, now),
  )
  const { bytes, report } = await buildApkg(
    SQL,
    {
      decks: [deck],
      notes: [note],
      cards,
      reviews: [],
      media: [{ name: 'carte-france.png', data: new Uint8Array(png) }],
    },
    { now, dayStartHour: 4 },
  )
  const out = resolve(process.env.RECTO_APKG_OUT ?? 'test-results/interop/recto-occlusion.apkg')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  expect(report).toMatchObject({ notes: 1, cards: 3, media: 1, missingMedia: [] })
})
