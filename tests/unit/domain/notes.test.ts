import { describe, expect, it } from 'vitest'
import { makeCard, makeDeck, resetScheduling } from '$lib/domain/defaults'
import { cardOrds, fieldCount, normalizeFields, renderCard } from '$lib/domain/notes'

describe('notes and cards', () => {
  it('generates the ords of each model (invariant 2)', () => {
    expect(cardOrds('basic', ['a', 'b'])).toEqual([0])
    expect(cardOrds('basic_reverse', ['a', 'b'])).toEqual([0, 1])
    expect(cardOrds('cloze', ['{{c1::a}} {{c3::b}} {{c1::c}}'])).toEqual([0, 2])
    expect(cardOrds('cloze', ['rien'])).toEqual([])
  })

  it('normalises field arrays', () => {
    expect(fieldCount('basic')).toBe(3)
    expect(fieldCount('cloze')).toBe(2)
    expect(normalizeFields('basic', ['a'])).toEqual(['a', '', ''])
    expect(normalizeFields('cloze', ['a', 'b', 'c'])).toEqual(['a', 'b'])
  })

  it('renders basic, reverse and flipped cards', () => {
    const note = { modelType: 'basic_reverse' as const, fields: ['Recto', 'Verso', 'Extra'] }
    expect(renderCard(note, { ord: 0, sideFlipped: false })).toMatchObject({
      question: 'Recto',
      answer: 'Verso',
      extra: 'Extra',
      flipped: false,
      expected: 'Verso',
    })
    expect(renderCard(note, { ord: 1, sideFlipped: false })).toMatchObject({
      question: 'Verso',
      answer: 'Recto',
    })
    // Leitner alternateSides: only applied when `flip` is enabled.
    expect(renderCard(note, { ord: 0, sideFlipped: true })).toMatchObject({ question: 'Recto' })
    expect(renderCard(note, { ord: 0, sideFlipped: true }, true)).toMatchObject({
      question: 'Verso',
      answer: 'Recto',
      flipped: true,
    })
    expect(renderCard(note, { ord: 1, sideFlipped: true }, true)).toMatchObject({
      question: 'Recto',
    })
  })

  it('renders cloze cards and ignores flipping', () => {
    const note = { modelType: 'cloze' as const, fields: ['{{c1::a}} {{c2::b}}', 'x'] }
    const r = renderCard(note, { ord: 1, sideFlipped: true }, true)
    expect(r).toEqual({
      question: 'a <span class="cloze">[…]</span>',
      answer: 'a <span class="cloze">b</span>',
      extra: 'x',
      answerReplacesQuestion: true,
      flipped: false,
      expected: 'b',
    })
  })

  it('builds decks and cards with defaults', () => {
    const deck = makeDeck({ name: '  Géo ', emoji: '🌍' }, 'd1', 1000)
    expect(deck).toMatchObject({ id: 'd1', name: 'Géo', parentId: null, scheduler: 'fsrs' })
    expect(deck.settings.fsrs.learningSteps).toEqual(['10m', '10m'])
    expect(deck.settings.leitner.intervals).toEqual([1, 2, 7, 30, 90, 180, 365])
    const card = makeCard({ id: 'n1', deckId: 'd1' }, 1, 'c1', 5000)
    expect(card).toMatchObject({ noteId: 'n1', deckId: 'd1', ord: 1, due: 5000, state: 0, box: 0 })
    const reset = resetScheduling(
      { ...card, state: 2, reps: 4, stability: 12, box: 5, retired: true, suspended: true },
      9000,
    )
    expect(reset).toMatchObject({
      state: 0,
      reps: 0,
      stability: 0,
      box: 0,
      due: 9000,
      retired: false,
    })
    expect(reset.suspended).toBe(true)
  })
})

describe('convertFields', () => {
  it('keeps front and extra across basic ↔ cloze', async () => {
    const { convertFields } = await import('$lib/domain/notes')
    expect(convertFields('basic', 'basic_reverse', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(convertFields('basic', 'cloze', ['a', 'b', 'c'])).toEqual(['a', 'c'])
    expect(convertFields('basic', 'cloze', ['a', 'b', ''])).toEqual(['a', 'b'])
    expect(convertFields('cloze', 'basic', ['t', 'x'])).toEqual(['t', '', 'x'])
  })
})
