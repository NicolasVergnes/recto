import { describe, expect, it } from 'vitest'
import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Review } from '$lib/domain/types'
import {
  readAll,
  readCard,
  readDeck,
  readManifest,
  readMediaMeta,
  readNote,
  readObject,
  readReview,
  readSetting,
} from '$lib/import/validate'

const deck = makeDeck({ name: 'D', description: 'x', emoji: '🌍' }, 'd', 1)
const note = {
  id: 'n',
  deckId: 'd',
  modelType: 'basic',
  fields: ['a'],
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  source: 's',
  sourceGuid: 'g',
}
const card = makeCard({ id: 'n', deckId: 'd' }, 0, 'c', 1)
const review: Review = {
  id: 'r',
  cardId: 'c',
  deckId: 'd',
  reviewedAt: 1,
  rating: 3,
  scheduler: 'fsrs',
  durationMs: 1,
  stateBefore: 0,
  dueBefore: 1,
  stabilityBefore: 0,
  difficultyBefore: 0,
  boxBefore: 0,
  learningStepsBefore: 0,
  lastReviewBefore: null,
  stateAfter: 1,
  dueAfter: 2,
  scheduledDays: 0,
  elapsedDays: 0,
  boxAfter: 0,
}

describe('backup validators', () => {
  it('accepts valid rows unchanged', () => {
    expect(readDeck(deck)).toEqual(deck)
    expect(
      readDeck({
        ...deck,
        parentId: 'p',
        settings: {
          ...deck.settings,
          fsrs: { ...deck.settings.fsrs, params: Array(21).fill(0.5), ratingMode: 2 },
          leitner: { ...deck.settings.leitner, mode: 'calendar' },
        },
      }),
    ).toMatchObject({
      parentId: 'p',
      settings: { fsrs: { ratingMode: 2 }, leitner: { mode: 'calendar' } },
    })
    expect(readNote(note)).toEqual(note)
    expect(readCard(card)).toEqual(card)
    expect(readCard({ ...card, flag: undefined })?.flag).toBe(0)
    expect(readReview(review)).toEqual(review)
    expect(readSetting({ key: 'k', value: null })).toEqual({ key: 'k', value: null })
    expect(
      readMediaMeta({ name: 'a', mime: 'image/png', size: 1, sha256: 'x', createdAt: 1 }),
    ).not.toBeNull()
    expect(readObject({ a: 1 })).toEqual({ a: 1 })
    expect(
      readManifest({
        format: 'recto-backup',
        schemaVersion: 1,
        appVersion: '0.1.0',
        exportedAt: 5,
        device: 'd',
      }),
    ).toEqual({ schemaVersion: 1, appVersion: '0.1.0', exportedAt: 5, device: 'd' })
  })

  it('rejects malformed rows', () => {
    const bad = [
      readDeck(null),
      readDeck({ ...deck, parentId: 3 }),
      readDeck({ ...deck, emoji: 1 }),
      readDeck({ ...deck, settings: null }),
      readDeck({ ...deck, scheduler: 'sm2' }),
      readNote({ ...note, modelType: 'image_occlusion' }),
      readNote({ ...note, createdAt: 'hier' }),
      readNote({ ...note, fields: [1] }),
      readCard({ ...card, state: 7 }),
      readCard({ ...card, due: Number.NaN }),
      readCard({ ...card, suspended: 'non' }),
      readCard({ ...card, id: 1 }),
      readReview({ ...review, rating: 5 }),
      readReview({ ...review, stateAfter: 9 }),
      readReview({ ...review, durationMs: null }),
      readReview({ ...review, cardId: undefined }),
      readSetting({ value: 1 }),
      readMediaMeta({ name: 'a', mime: 'image/png', size: '1', sha256: 'x', createdAt: 1 }),
      readMediaMeta('a'),
      readObject([1]),
      readManifest(null),
    ]
    expect(bad.every((x) => x === null)).toBe(true)
  })

  it('keeps defaults for missing or invalid optional settings', () => {
    const d = readDeck({
      ...deck,
      settings: {
        newOrder: 'x',
        fsrs: { learningSteps: 'no', params: 'no' },
        leitner: { intervals: [1, 2] },
      },
    })
    expect(d?.settings).toMatchObject({
      newOrder: 'added',
      fsrs: { learningSteps: ['10m', '10m'], params: null, ratingMode: 4 },
      leitner: { intervals: [1, 2, 7, 30, 90, 180, 365], mode: 'interval' },
    })
    expect(readAll('x', readSetting)).toEqual({ rows: [], invalid: 0 })
  })
})
