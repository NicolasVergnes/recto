import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Card, Deck, Media, ModelType, Note, Review, Setting } from '$lib/domain/types'
import { sha256Hex } from '$lib/media/hash'
import { seededRandom } from '$lib/queue/random'
import type { RectoDB } from '$lib/db/schema'

/** A random but reproducible collection, written straight into `db`. */
export async function generateCollection(db: RectoDB, seed: string) {
  const random = seededRandom(seed)
  const int = (n: number) => Math.floor(random() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)] as T
  const t0 = Date.UTC(2026, 0, 1)
  let n = 0
  const id = () => `${seed}-${++n}`

  const decks: Deck[] = []
  for (let i = 0; i < 1 + int(3); i++) {
    const parent = makeDeck(
      { name: `Deck ${i} é`, scheduler: pick(['fsrs', 'leitner'] as const), emoji: '🌍' },
      id(),
      t0 + i,
    )
    decks.push(parent)
    if (random() < 0.6)
      decks.push(
        makeDeck({ name: `Sub ${i}`, parentId: parent.id, description: 'd' }, id(), t0 + i),
      )
  }
  const media: Media[] = []
  for (let i = 0; i < int(4); i++) {
    const bytes = new Uint8Array(10 + int(200)).map(() => int(256))
    const blob = new Blob([bytes], { type: 'image/png' })
    media.push({
      name: `m${i}-${seed}.png`,
      blob,
      mime: 'image/png',
      size: blob.size,
      sha256: await sha256Hex(blob),
      createdAt: t0,
    })
  }
  const notes: Note[] = []
  const cards: Card[] = []
  const reviews: Review[] = []
  for (let i = 0; i < 5 + int(20); i++) {
    const modelType = pick<ModelType>(['basic', 'basic_reverse', 'cloze', 'image_occlusion'])
    const deck = pick(decks)
    const img =
      media.length > 0 && random() < 0.3 ? `<img src="${pick(media).name}" alt="a « b »">` : ''
    const masks = JSON.stringify({
      v: 1,
      mode: pick(['hideAll', 'hideOne']),
      masks: [
        { n: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.3, label: `L${i} « é »` },
        { n: 2, x: 0.5, y: 0.25, w: 0.125, h: 0.5 },
      ],
    })
    const fields =
      modelType === 'cloze'
        ? [`Texte {{c1::a${i}}} et {{c2::b}} ${img}`, 'extra; "quoted"']
        : modelType === 'image_occlusion'
          ? [img, masks, `Titre ${i}`, 'extra']
          : [`Q${i} ${img}`, `R${i}\nligne`, '']
    const note: Note = {
      id: id(),
      deckId: deck.id,
      modelType,
      fields,
      tags: random() < 0.5 ? ['t1', 'tag-é'] : [],
      createdAt: t0 + i,
      updatedAt: t0 + i * 2,
    }
    if (random() < 0.3) note.source = 'https://example.org'
    if (random() < 0.2) note.sourceGuid = `guid-${i}`
    notes.push(note)
    for (const ord of modelType === 'basic' ? [0] : [0, 1]) {
      const card: Card = {
        ...makeCard(note, ord, id(), t0 + i),
        state: pick([0, 1, 2, 3] as const),
        stability: random() * 50,
        difficulty: 1 + random() * 9,
        box: int(8),
        flag: pick([0, 1, 2] as const),
        suspended: random() < 0.1,
        lastReview: random() < 0.5 ? t0 + int(1e9) : null,
      }
      cards.push(card)
      for (let r = 0; r < int(4); r++) {
        reviews.push({
          id: id(),
          cardId: card.id,
          deckId: card.deckId,
          reviewedAt: t0 + int(1e9),
          rating: pick([1, 2, 3, 4] as const),
          scheduler: deck.scheduler,
          durationMs: int(60_000),
          stateBefore: 0,
          dueBefore: t0,
          stabilityBefore: 0,
          difficultyBefore: 0,
          boxBefore: 0,
          learningStepsBefore: 0,
          lastReviewBefore: null,
          stateAfter: 2,
          dueAfter: t0 + 86_400_000,
          scheduledDays: 1,
          elapsedDays: int(30),
          boxAfter: 2,
        })
      }
    }
  }
  const settings: Setting[] = [
    { key: 'dayStartHour', value: 4 },
    { key: 'theme', value: 'dark' },
    { key: 'lastDeckId', value: decks[0]?.id ?? null },
  ]
  await db.transaction(
    'rw',
    [db.decks, db.notes, db.cards, db.reviews, db.media, db.settings],
    async () => {
      await db.decks.bulkAdd(decks)
      await db.notes.bulkAdd(notes)
      await db.cards.bulkAdd(cards)
      await db.reviews.bulkAdd(reviews)
      await db.media.bulkAdd(media)
      await db.settings.bulkAdd(settings)
    },
  )
}

/** Plain comparable snapshot of a database (media compared by bytes). */
export async function dumpDatabase(db: RectoDB) {
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id))
  const media = await Promise.all(
    (await db.media.toArray()).map(async (m) => ({
      name: m.name,
      mime: m.mime,
      size: m.size,
      sha256: m.sha256,
      createdAt: m.createdAt,
      bytes: Array.from(new Uint8Array(await m.blob.arrayBuffer())),
    })),
  )
  return {
    decks: byId(await db.decks.toArray()),
    notes: byId(await db.notes.toArray()),
    cards: byId(await db.cards.toArray()),
    reviews: byId(await db.reviews.toArray()),
    settings: (await db.settings.toArray()).sort((a, b) => a.key.localeCompare(b.key)),
    media: media.sort((a, b) => a.name.localeCompare(b.name)),
  }
}
