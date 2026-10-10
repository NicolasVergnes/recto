import { describe, expect, it } from 'vitest'
import { makeCard, makeDeck, resetScheduling } from '$lib/domain/defaults'
import { canTypeAnswer } from '$lib/domain/typed'
import {
  byRecency,
  cardOrds,
  fieldCount,
  normalizeFields,
  reconcileCards,
  renderCard,
} from '$lib/domain/notes'

describe('reconcileCards (invariant 2)', () => {
  /** A stored card: `ord`, with when it was last reviewed (null: never) and how many times. */
  const card = (id: string, ord: number, lastReview: number | null = null, reps = 0) => ({
    ...makeCard({ id: 'n', deckId: 'd' }, ord, id, 0),
    lastReview,
    reps,
  })
  const ids = (cards: { id: string }[]) => cards.map((c) => c.id)

  it('keeps the cards of the generated ords, creates the missing ones, removes the others', () => {
    const cards = [card('c1', 0), card('c2', 1), card('c3', 2)]
    const { keep, create, remove } = reconcileCards(cards, [0, 2, 3])
    expect(ids(keep)).toEqual(['c1', 'c3'])
    expect(create).toEqual([3])
    expect(ids(remove)).toEqual(['c2'])
  })

  it('leaves a note that already matches its content untouched', () => {
    const cards = [card('b', 1), card('a', 0)]
    const { keep, create, remove } = reconcileCards(cards, [0, 1])
    // `keep` follows the ords, `remove` the order given.
    expect(ids(keep)).toEqual(['a', 'b'])
    expect([create, remove]).toEqual([[], []])
  })

  it('creates every card of a note that has none, and removes every card of a note that generates none', () => {
    expect(reconcileCards([], [0, 1]).create).toEqual([0, 1])
    const { keep, create, remove } = reconcileCards([card('c1', 0)], [])
    expect([keep, create, ids(remove)]).toEqual([[], [], ['c1']])
  })

  it('keeps the most recently reviewed of the cards sharing an ord, then the busiest', () => {
    const cards = [
      card('never', 2),
      card('old', 2, 1000, 9),
      card('recent', 2, 5000, 1),
      card('same-day-less', 0, 700, 1),
      card('same-day-more', 0, 700, 4),
    ]
    const { keep, create, remove } = reconcileCards(cards, [0, 2])
    expect(ids(keep)).toEqual(['same-day-more', 'recent'])
    expect(create).toEqual([])
    expect(ids(remove)).toEqual(['never', 'old', 'same-day-less'])
  })

  it('does not change the cards it is given and orders copies with byRecency', () => {
    const cards = [card('a', 0, 1), card('b', 0, 2)]
    reconcileCards(cards, [0])
    expect(ids(cards)).toEqual(['a', 'b'])
    expect(byRecency(card('x', 0, 5), card('y', 0, null))).toBeLessThan(0)
    expect(byRecency(card('x', 0, null, 2), card('y', 0, null, 1))).toBeLessThan(0)
    expect(byRecency(card('x', 0, 3, 1), card('y', 0, 3, 1))).toBe(0)
  })
})

describe('notes and cards', () => {
  it('generates the ords of each model (invariant 2)', () => {
    expect(cardOrds('basic', ['a', 'b'])).toEqual([0])
    expect(cardOrds('cloze', ['{{c1::a}} {{c3::b}} {{c1::c}}'])).toEqual([0, 2])
    expect(cardOrds('cloze', ['rien'])).toEqual([])
  })

  it('normalises field arrays', () => {
    expect(fieldCount('basic')).toBe(3)
    expect(fieldCount('cloze')).toBe(2)
    expect(normalizeFields('basic', ['a'])).toEqual(['a', '', ''])
    expect(normalizeFields('cloze', ['a', 'b', 'c'])).toEqual(['a', 'b'])
  })

  it('renders a basic card on either side (one card, both ways: M11)', () => {
    const note = { modelType: 'basic' as const, fields: ['Recto', 'Verso', 'Extra'] }
    expect(renderCard(note, { ord: 0, sideFlipped: false })).toMatchObject({
      question: 'Recto',
      answer: 'Verso',
      extra: 'Extra',
      flipped: false,
      expected: 'Verso',
    })
    // The deck's alternateSides: only applied when `flip` is enabled.
    expect(renderCard(note, { ord: 0, sideFlipped: true })).toMatchObject({ question: 'Recto' })
    expect(renderCard(note, { ord: 0, sideFlipped: true }, true)).toMatchObject({
      question: 'Verso',
      answer: 'Recto',
      flipped: true,
      expected: 'Recto',
    })
    // A one-way note is always asked front → back.
    expect(
      renderCard({ ...note, oneWay: true }, { ord: 0, sideFlipped: true }, true),
    ).toMatchObject({ question: 'Recto', answer: 'Verso', flipped: false })
  })

  it('types the side that is not asked: nothing to type when it is a picture', () => {
    const note = { modelType: 'basic' as const, fields: ['Ain', '<img src="ain.png">', ''] }
    // Name asked, picture expected: no typed answer (canTypeAnswer, typed.ts).
    const front = renderCard(note, { ord: 0, sideFlipped: false }, true)
    expect(canTypeAnswer(front.expected)).toBe(false)
    // Picture asked, name expected: the name is typed.
    const back = renderCard(note, { ord: 0, sideFlipped: true }, true)
    expect(back.question).toBe('<img src="ain.png">')
    expect(canTypeAnswer(back.expected)).toBe(true)
    expect(back.expected).toBe('Ain')
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
    const deck = makeDeck({ name: '  Géo ' }, 'd1', 1000)
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
    expect(convertFields('basic', 'cloze', ['a', 'b', 'c'])).toEqual(['a', 'c'])
    expect(convertFields('basic', 'cloze', ['a', 'b', ''])).toEqual(['a', 'b'])
    expect(convertFields('cloze', 'basic', ['t', 'x'])).toEqual(['t', '', 'x'])
  })
})

describe('image occlusion notes', () => {
  const masks = JSON.stringify({
    v: 1,
    mode: 'hideAll',
    masks: [
      { n: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'Lyon' },
      { n: 1, x: 0.5, y: 0.5, w: 0.2, h: 0.2, label: 'Paris <b>' },
      { n: 2, x: 0.7, y: 0.1, w: 0.2, h: 0.2, label: 'Rhône' },
    ],
  })
  const note = {
    modelType: 'image_occlusion' as const,
    fields: ['<img src="carte.webp" alt="Carte">', masks, 'Villes', 'Extra'],
  }

  it('has four fields and one card per mask group', async () => {
    const { buildRow } = await import('$lib/domain/browse')
    expect(fieldCount('image_occlusion')).toBe(4)
    expect(normalizeFields('image_occlusion', ['a'])).toEqual(['a', '', '', ''])
    expect(cardOrds('image_occlusion', note.fields)).toEqual([0, 1])
    expect(cardOrds('image_occlusion', ['<img src="x.png">', ''])).toEqual([])
    const card = makeCard({ id: 'n1', deckId: 'd1' }, 1, 'c1', 0)
    const row = buildRow(
      card,
      { ...note, id: 'n1', deckId: 'd1', tags: [], createdAt: 0, updatedAt: 0 },
      'D',
    )
    expect(row.question).toBe('Villes #2')
    expect(row.answer).toBe('Lyon, Rhône')
  })

  it('renders the target group, its labels only as the answer, and never flips', () => {
    const r = renderCard(note, { ord: 0, sideFlipped: true }, true)
    expect(r).toEqual({
      question: 'Villes',
      answer: 'Paris &lt;b&gt;',
      extra: 'Extra',
      answerReplacesQuestion: false,
      flipped: false,
      expected: 'Paris &lt;b&gt;',
      occlusion: {
        image: 'carte.webp',
        alt: 'Carte',
        mode: 'hideAll',
        masks: [
          { n: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'Lyon' },
          { n: 1, x: 0.5, y: 0.5, w: 0.2, h: 0.2, label: 'Paris <b>' },
          { n: 2, x: 0.7, y: 0.1, w: 0.2, h: 0.2, label: 'Rhône' },
        ],
        target: 1,
      },
    })
    const noImage = renderCard(
      { ...note, fields: ['', masks, '', ''] },
      { ord: 1, sideFlipped: false },
    )
    expect(noImage.occlusion).toMatchObject({ image: '', alt: '', target: 2 })
    expect(noImage.expected).toBe('Lyon, Rhône')
  })

  it('converts fields to and from occlusion notes', async () => {
    const { convertFields } = await import('$lib/domain/notes')
    const img = '<img src="carte.webp" alt="Carte">'
    // Nothing typed is lost: the front becomes the header, the back joins the extra.
    expect(convertFields('basic', 'image_occlusion', ['Q', `A ${img}`, 'X'])).toEqual([
      img,
      '',
      'Q',
      'A <br>X',
    ])
    expect(convertFields('basic', 'image_occlusion', [`Où ? ${img}`, '', ''])).toEqual([
      img,
      '',
      'Où ? ',
      '',
    ])
    expect(convertFields('cloze', 'image_occlusion', ['{{c1::a}}', 'X'])).toEqual([
      '',
      '',
      '{{c1::a}}',
      'X',
    ])
    // Back from occlusion: header and image make the front.
    expect(convertFields('image_occlusion', 'basic', note.fields)).toEqual([
      `Villes<br>${img}`,
      '',
      'Extra',
    ])
    expect(convertFields('image_occlusion', 'cloze', note.fields)).toEqual([
      `Villes<br>${img}`,
      'Extra',
    ])
    expect(convertFields('image_occlusion', 'basic', [img, '', '', ''])).toEqual([img, '', ''])
    expect(convertFields('image_occlusion', 'image_occlusion', ['a'])).toEqual(['a', '', '', ''])
  })
})
