import { makeCard, makeDeck } from '$lib/domain/defaults'
import { cardOrds } from '$lib/domain/notes'
import type { Card, Deck, ModelType, Note, Rating, Review } from '$lib/domain/types'
import type { ApkgExportInput } from '$lib/export/apkg'
import { getScheduler } from '$lib/scheduler'

export const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
])
export const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0])

const MIN = 60_000
const DAY = 86_400_000

/**
 * A small but representative collection for the Anki export (05 §4): basic, reverse and cloze
 * notes, a sub-deck, FSRS and Leitner decks, histories replayed by the real schedulers (card
 * states and reviews agree), a suspended, a retired and a flagged card, media (one absent, one
 * unreferenced).
 */
export function representativeCollection(now: number): ApkgExportInput {
  const t0 = now - 30 * DAY
  const schedulers = {
    fsrs: getScheduler('fsrs', { dayStartHour: 4, fuzz: false }),
    leitner: getScheduler('leitner', { dayStartHour: 4, fuzz: false }),
  }
  const geo = makeDeck({ name: 'Géo', description: 'Cartes <de> géographie' }, 'deck-geo', t0)
  const dep = makeDeck({ name: 'Départements', parentId: geo.id }, 'deck-dep', t0)
  const box = makeDeck({ name: 'Boîte', scheduler: 'leitner' }, 'deck-box', t0 + 1)
  const notes: Note[] = []
  const cards: Card[] = []
  const reviews: Review[] = []

  function note(deck: Deck, modelType: ModelType, fields: string[], extra: Partial<Note> = {}) {
    const createdAt = t0 + notes.length * MIN
    const n: Note = {
      id: `note-${notes.length + 1}`,
      deckId: deck.id,
      modelType,
      fields,
      tags: [],
      createdAt,
      updatedAt: createdAt,
      ...extra,
    }
    notes.push(n)
    for (const ord of cardOrds(modelType, fields))
      cards.push(makeCard(n, ord, `${n.id}-${ord}`, createdAt))
    return n
  }

  /** Answers a card with its deck's scheduler at the given times, then applies `patch`. */
  function study(n: Note, ord: number, answers: [Rating, number][], patch: Partial<Card> = {}) {
    const deck = [geo, dep, box].find((d) => d.id === n.deckId)
    const i = cards.findIndex((c) => c.noteId === n.id && c.ord === ord)
    let card = cards[i]
    if (!deck || !card) throw new Error('fixture')
    for (const [rating, at] of answers) {
      const outcome = schedulers[deck.scheduler].answer(card, rating, at, deck)
      reviews.push({ ...outcome.review, id: `review-${reviews.length + 1}`, durationMs: 4000 })
      card = outcome.card
    }
    cards[i] = { ...card, ...patch }
  }

  const capital = note(geo, 'basic', ['Capitale <b>France</b>', 'Paris', ''], {
    tags: ['geo', 'tag-é'],
  })
  study(capital, 0, [
    [3, t0 + DAY],
    [3, t0 + DAY + 10 * MIN],
    [3, t0 + 5 * DAY],
    [3, now - 9 * DAY],
  ])
  const reverse = note(dep, 'basic_reverse', ['75', 'Paris', 'Préfecture'], {
    tags: ['dep'],
    sourceGuid: 'aB3dE5fG7h',
  })
  study(reverse, 0, [[3, now - 2 * MIN]]) // learning
  const lapse: [Rating, number][] = [
    [3, t0 + 2 * DAY],
    [3, t0 + 2 * DAY + 10 * MIN],
    [1, now - MIN],
  ]
  study(reverse, 1, lapse, { flag: 2 }) // relearning
  const cloze = note(geo, 'cloze', [
    'La {{c1::Lune}} et la {{c2::Terre::planète}}<br><img src="lune.png" alt="Lune">',
    'Extra [sound:bip.mp3]',
  ])
  const easy: [Rating, number][] = [
    [3, t0 + 3 * DAY],
    [4, t0 + 3 * DAY + 10 * MIN],
  ]
  study(cloze, 0, easy, { suspended: true }) // c1 suspended (overdue review), c2 stays new
  note(geo, 'basic', ['Nouvelle', 'Carte', ''])
  const dog = note(box, 'basic', ['Chien', 'Dog', ''])
  const sure: [Rating, number][] = [
    [3, t0 + DAY],
    [4, t0 + 3 * DAY],
    [3, now - 5 * DAY],
  ]
  study(dog, 0, sure, { retired: true })
  const cat = note(box, 'basic', ['Chat', 'Cat', '<img src="absent.png">'])
  study(cat, 0, [
    [3, t0 + DAY],
    [1, now - 3 * MIN],
  ])

  return {
    decks: [geo, dep, box],
    notes,
    cards,
    reviews,
    media: [
      { name: 'lune.png', data: PNG },
      { name: 'bip.mp3', data: MP3 },
      { name: 'orphan.png', data: PNG },
    ],
  }
}
