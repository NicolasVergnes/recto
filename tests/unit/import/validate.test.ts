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
  readNoteType,
  readObject,
  readReview,
  readSetting,
} from '$lib/import/validate'

const deck = makeDeck({ name: 'D', description: 'x' }, 'd', 1)
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
        },
      }),
    ).toMatchObject({ parentId: 'p', settings: { fsrs: { ratingMode: 2 } } })
    // The booklet calendar mode (removed in M9) is dropped from older backups.
    const old = { ...deck.settings.leitner, mode: 'calendar' }
    expect(readDeck({ ...deck, settings: { ...deck.settings, leitner: old } })).toEqual(deck)
    // The deck emoji (removed in M11) is dropped from older backups, whatever its value.
    expect(readDeck({ ...deck, emoji: '🌍' })).toEqual(deck)
    expect(readDeck({ ...deck, emoji: 1 })).toEqual(deck)
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
    ).toEqual({ schemaVersion: 1, appVersion: '0.1.0', exportedAt: 5, device: 'd', deviceId: '' })
  })

  it('keeps the Anki styling of a note type, dropping wrong values (M10)', () => {
    const type = {
      id: 't',
      name: 'T',
      fields: ['A', 'B'],
      templates: [{ name: 'C', front: '{{A}}', back: '{{B}}' }],
      createdAt: 1,
      updatedAt: 2,
    }
    expect(readNoteType(type)?.anki).toBeUndefined()
    expect(
      readNoteType({
        ...type,
        anki: { css: '.card {}', latexPre: 'P', latexPost: 7, sortField: 1 },
      })?.anki,
    ).toEqual({ css: '.card {}', latexPre: 'P', sortField: 1 })
    expect(readNoteType({ ...type, anki: { sortField: 2 } })?.anki).toBeUndefined()
    expect(readNoteType({ ...type, anki: 'x' })?.name).toBe('T')
  })

  it('accepts every note type, image occlusion included', () => {
    expect(readNote({ ...note, modelType: 'image_occlusion' })?.modelType).toBe('image_occlusion')
  })

  it('reads the sides of basic notes and decks (M11)', () => {
    expect(readNote({ ...note, oneWay: true })?.oneWay).toBe(true)
    expect(readNote({ ...note, oneWay: 'oui' })).toEqual(note)
    expect(readNote({ ...note, modelType: 'cloze', oneWay: true })?.oneWay).toBeUndefined()
    // The reversed type was removed in M11 (no migration: test phase).
    expect(readNote({ ...note, modelType: 'basic_reverse' })).toBeNull()
    const off = { ...deck.settings, alternateSides: false }
    expect(readDeck({ ...deck, settings: off })?.settings.alternateSides).toBe(false)
    const { alternateSides: _, ...older } = deck.settings
    expect(readDeck({ ...deck, settings: older })?.settings.alternateSides).toBe(true)
  })

  it('rejects malformed rows', () => {
    const bad = [
      readDeck(null),
      readDeck({ ...deck, parentId: 3 }),
      readDeck({ ...deck, settings: null }),
      readDeck({ ...deck, scheduler: 'sm2' }),
      readNote({ ...note, modelType: 'diagram' }),
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
        burySiblings: true,
        fsrs: { learningSteps: 'no', params: 'no' },
        leitner: { intervals: [1] },
      },
    })
    expect(d?.settings).not.toHaveProperty('burySiblings')
    expect(d?.settings).toMatchObject({
      newOrder: 'random',
      fsrs: { learningSteps: ['10m', '10m'], params: null, ratingMode: 4 },
      leitner: { model: 'seven', intervals: [1, 2, 7, 30, 90, 180, 365], allowSure: true },
    })
    expect(readAll('x', readSetting)).toEqual({ rows: [], invalid: 0 })
  })

  it('reads the box of a deck, named or not (M19)', () => {
    const leitner = (box: Record<string, unknown>) =>
      readDeck({ ...deck, settings: { ...deck.settings, leitner: box } })?.settings.leitner
    expect(leitner({ model: 'five', intervals: [9, 9], allowSure: false })).toEqual({
      model: 'five',
      intervals: [1, 3, 7, 14, 30],
      allowSure: false,
      failToBox: 1,
    })
    expect(leitner({ model: 'custom', intervals: [1, 4, 10] })).toMatchObject({
      model: 'custom',
      intervals: [1, 4, 10],
    })
    // Before schema 8: no model; hand-changed intervals (M9) are kept as « Ma boîte ».
    expect(leitner({ intervals: [1, 2, 7, 30, 90, 180, 365] })?.model).toBe('seven')
    expect(leitner({ intervals: [1, 2, 5, 30, 90, 180, 365] })).toMatchObject({
      model: 'custom',
      intervals: [1, 2, 5, 30, 90, 180, 365],
    })
    expect(leitner({ model: 'custom', intervals: [0, 3] })).toMatchObject({ model: 'seven' })
    expect(leitner({ model: 'x', intervals: Array(11).fill(1) })).toMatchObject({
      model: 'seven',
    })
  })
})
