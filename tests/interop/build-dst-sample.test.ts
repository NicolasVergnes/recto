import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Card, Note } from '$lib/domain/types'
import { buildApkg } from '$lib/export/apkg'
import { addDays, daysBetween, startOfDate, studyDate } from '$lib/scheduler/day'

// Writes `recto-dst-h<hour>.apkg` (in $RECTO_APKG_DIR, default test-results/interop) for several
// study day starts: one review card overdue since the other side of a daylight-saving change (so
// `crt` is there too) and one due in 3 days. Imported by check_apkg.py with the same TZ
// (tests/setup.ts: Europe/Paris), each card's `due - today` must equal the value written in
// `recto-dst-expected.json`.
it('writes packages whose crt is across a DST change, for the real-Anki check', async () => {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default
  const SQL = await initSqlJs()
  const now = Date.now()
  const year = new Date(now).getFullYear()
  const winter = new Date(now).getTimezoneOffset() === new Date(year, 0, 15).getTimezoneOffset()
  const old = winter ? { year: year - 1, month: 6, day: 15 } : { year, month: 0, day: 15 }
  const dir = resolve(process.env.RECTO_APKG_DIR ?? 'test-results/interop')
  mkdirSync(dir, { recursive: true })
  const deck = makeDeck({ name: 'Heure' }, 'deck', now)
  const expected: Record<string, { overdue: number; soon: number }> = {}

  function reviewCard(id: string, due: number, createdAt: number): [Note, Card] {
    const note: Note = {
      id,
      deckId: deck.id,
      modelType: 'basic',
      fields: [id, 'verso', ''],
      tags: [],
      createdAt,
      updatedAt: createdAt,
    }
    const card: Card = {
      ...makeCard(note, 0, `${id}-0`, createdAt),
      state: 2,
      due,
      scheduledDays: 10,
      stability: 10,
      difficulty: 5,
      reps: 2,
      lastReview: createdAt,
    }
    return [note, card]
  }

  for (const dayStartHour of [4, 22, 23]) {
    const overdue = startOfDate(old, dayStartHour) + 3_600_000
    const soon = startOfDate(addDays(studyDate(now, dayStartHour), 3), dayStartHour) + 3_600_000
    const [n1, c1] = reviewCard('overdue', overdue, now - 2)
    const [n2, c2] = reviewCard('soon', soon, now - 1)
    const { bytes } = await buildApkg(
      SQL,
      { decks: [deck], notes: [n1, n2], cards: [c1, c2], reviews: [], media: [] },
      { now, dayStartHour },
    )
    const file = `recto-dst-h${dayStartHour}.apkg`
    writeFileSync(resolve(dir, file), bytes)
    expected[file] = { overdue: -daysBetween(overdue, now, dayStartHour), soon: 3 }
    expect(expected[file]?.overdue).toBeLessThan(-60)
  }
  writeFileSync(resolve(dir, 'recto-dst-expected.json'), JSON.stringify(expected, null, 1))
})
