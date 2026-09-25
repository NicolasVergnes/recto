import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { restoreBackup } from '$lib/db/restore'
import { RectoDB, SCHEMA_VERSION, useDatabase } from '$lib/db/schema'
import { createBackup } from '$lib/export/backup'
import { BackupError, parseBackup } from '$lib/import/backup'
import { dumpDatabase, generateCollection } from '../../helpers/generate'
import { useTestDatabase } from '../../helpers/db'

const env = useTestDatabase()
const now = Date.UTC(2026, 8, 25)

async function exportBytes() {
  return new Uint8Array(await (await createBackup(now)).arrayBuffer())
}

async function freshDatabase() {
  const next = new RectoDB(`restore-${crypto.randomUUID()}`)
  useDatabase(next)
  return next
}

describe('backup round trip (property: restore(export(db)) ≡ db)', () => {
  for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
    it(`restores seed ${seed} bit for bit`, async () => {
      await generateCollection(env.db, seed)
      const before = await dumpDatabase(env.db)
      const bytes = await exportBytes()
      const parsed = parseBackup(bytes, SCHEMA_VERSION)
      expect(parsed.invalid).toBe(0)
      expect(parsed.manifest.counts.cards).toBe(before.cards.length)

      const target = await freshDatabase()
      try {
        const report = await restoreBackup(parsed, 'replace')
        expect(report.missingFiles).toBe(0)
        expect(await dumpDatabase(target)).toEqual(before)
      } finally {
        await target.delete()
      }
    })
  }

  it('replace wipes what was there before', async () => {
    await generateCollection(env.db, 'one')
    const bytes = await exportBytes()
    const target = await freshDatabase()
    try {
      await generateCollection(target, 'two')
      await restoreBackup(parseBackup(bytes, SCHEMA_VERSION), 'replace')
      expect((await target.decks.toArray()).every((d) => d.id.startsWith('one-'))).toBe(true)
    } finally {
      await target.delete()
    }
  })
})

describe('merge', () => {
  it('is idempotent on the same data', async () => {
    await generateCollection(env.db, 'same')
    const bytes = await exportBytes()
    const before = await dumpDatabase(env.db) // includes lastBackupAt written by the export
    const report = await restoreBackup(parseBackup(bytes, SCHEMA_VERSION), 'merge')
    expect(report).toMatchObject({
      decks: 0,
      notes: 0,
      notesUpdated: 0,
      cards: 0,
      reviews: 0,
      media: 0,
    })
    expect(await dumpDatabase(env.db)).toEqual(before)
  })

  it('adds what is missing and keeps the most recent version', async () => {
    await generateCollection(env.db, 'm')
    const bytes = await exportBytes()
    const parsed = parseBackup(bytes, SCHEMA_VERSION)
    const [first, second] = parsed.data.notes
    if (!first || !second) throw new Error('fixture')
    // Local edits: `first` newer locally, `second` older locally than the backup.
    await env.db.notes.update(first.id, {
      fields: ['local', 'x', ''],
      updatedAt: first.updatedAt + 10,
    })
    await env.db.notes.update(second.id, {
      fields: ['old', 'x', ''],
      updatedAt: second.updatedAt - 10,
    })
    const removedCard = parsed.data.cards.find((c) => c.noteId === first.id)
    if (!removedCard) throw new Error('fixture')
    await env.db.cards.delete(removedCard.id)
    await env.db.reviews.where('cardId').equals(removedCard.id).delete()
    const lostReviews = parsed.data.reviews.filter((r) => r.cardId === removedCard.id).length

    const report = await restoreBackup(parsed, 'merge')
    expect((await env.db.notes.get(first.id))?.fields[0]).toBe('local')
    expect((await env.db.notes.get(second.id))?.fields).toEqual(second.fields)
    expect(report.notesUpdated).toBe(1)
    expect(report.cards).toBe(1)
    expect(report.reviews).toBe(lostReviews)
    expect(await env.db.cards.get(removedCard.id)).toBeDefined()
  })

  it('merges decks by name and notes by Anki guid', async () => {
    await generateCollection(env.db, 'g')
    const parsed = parseBackup(await exportBytes(), SCHEMA_VERSION)
    const target = await freshDatabase()
    try {
      const deck = parsed.data.decks.find((d) => !d.parentId)
      const note = parsed.data.notes.find((n) => n.deckId === deck?.id)
      if (!deck || !note) throw new Error('fixture')
      // Same deck name under another id, same guid under another note id (older).
      await target.decks.add({ ...deck, id: 'local-deck' })
      await target.notes.add({
        ...note,
        id: 'local-note',
        deckId: 'local-deck',
        sourceGuid: 'shared',
        updatedAt: 0,
        fields: ['vieux', '', ''],
      })
      const withGuid = {
        ...parsed,
        data: {
          ...parsed.data,
          notes: parsed.data.notes.map((n) =>
            n.id === note.id ? { ...n, sourceGuid: 'shared' } : n,
          ),
        },
      }
      await restoreBackup(withGuid, 'merge')
      expect(await target.decks.get(deck.id)).toBeUndefined()
      expect((await target.notes.get('local-note'))?.fields).toEqual(note.fields)
      expect(await target.notes.get(note.id)).toBeUndefined()
      const cards = await target.cards.toArray()
      const notes = new Map((await target.notes.toArray()).map((n) => [n.id, n]))
      for (const c of cards) expect(c.deckId).toBe(notes.get(c.noteId)?.deckId)
    } finally {
      await target.delete()
    }
  })
})

describe('parseBackup errors', () => {
  const zip = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
  const code = (fn: () => unknown) => {
    try {
      fn()
    } catch (e) {
      return e instanceof BackupError ? e.code : 'other'
    }
    return 'none'
  }

  it('rejects non-zip, foreign zips, newer versions and broken JSON', () => {
    expect(code(() => parseBackup(strToU8('pas un zip'), 1))).toBe('notZip')
    expect(code(() => parseBackup(zip({ 'a.txt': 'x' }), 1))).toBe('notBackup')
    expect(code(() => parseBackup(zip({ 'manifest.json': '{"format":"autre"}' }), 1))).toBe(
      'notBackup',
    )
    expect(code(() => parseBackup(zip({ 'manifest.json': '[1]' }), 1))).toBe('notBackup')
    const manifest = JSON.stringify({ format: 'recto-backup', schemaVersion: 2 })
    expect(code(() => parseBackup(zip({ 'manifest.json': manifest }), 1))).toBe('newerVersion')
    const ok = JSON.stringify({ format: 'recto-backup', schemaVersion: 1 })
    expect(code(() => parseBackup(zip({ 'manifest.json': ok, 'data.json': '{' }), 1))).toBe(
      'invalidData',
    )
    expect(code(() => parseBackup(zip({ 'manifest.json': ok, 'data.json': '[]' }), 1))).toBe(
      'invalidData',
    )
    expect(code(() => parseBackup(zip({ 'manifest.json': ok }), 1))).toBe('notBackup')
  })

  it('drops invalid rows and fills missing deck settings with defaults', () => {
    const ok = JSON.stringify({ format: 'recto-backup', schemaVersion: 1 })
    const data = JSON.stringify({
      decks: [
        {
          id: 'd',
          name: 'D',
          scheduler: 'fsrs',
          createdAt: 1,
          updatedAt: 1,
          settings: { fsrs: {}, leitner: {} },
        },
        { id: 'bad', name: 'B', scheduler: 'sm2', createdAt: 1, updatedAt: 1 },
        {
          id: 'bad2',
          name: 'B',
          scheduler: 'fsrs',
          createdAt: 1,
          updatedAt: 1,
          settings: { fsrs: { requestRetention: 5 }, leitner: {} },
        },
      ],
      notes: [{ id: 'n' }],
      cards: 'nope',
      settings: [{ key: 'theme', value: 'dark' }, { nokey: 1 }],
      media: [{ name: 'm.png', mime: 'image/png', size: 3, sha256: 'x', createdAt: 1 }],
    })
    const parsed = parseBackup(
      zip({ 'manifest.json': ok, 'data.json': data, 'media/m.png': 'abc' }),
      1,
    )
    expect(parsed.data.decks).toHaveLength(1)
    expect(parsed.data.decks[0]?.settings.newPerDay).toBe(20)
    expect(parsed.data.decks[0]?.settings.fsrs.learningSteps).toEqual(['10m', '10m'])
    // 2 decks, 1 note, 1 setting (a non-array table is simply empty).
    expect(parsed.invalid).toBe(4)
    expect(parsed.files.get('m.png')).toEqual(strToU8('abc'))
    expect(parsed.manifest).toMatchObject({ appVersion: '', exportedAt: 0, device: '' })
  })
})
