import type { ApkgCard, ApkgModel, ApkgPackage, ApkgRevlog } from '$lib/import/apkg'

/** Day 0 of the test collections (seconds): 2023-11-14, the `crt` of data/samples/sample-legacy. */
export const CRT = 1699934400

export const CLOZE_MODEL: ApkgModel = {
  id: '10',
  name: 'Cloze',
  type: 1,
  fields: ['Text', 'Back Extra'],
  templates: [{ name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
}

export const BASIC_MODEL: ApkgModel = {
  id: '11',
  name: 'Basic',
  type: 0,
  fields: ['Front', 'Back'],
  templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }],
}

/** A note type that stays custom (M8): the third card only exists when its hint is filled. */
export const COUNTRY_MODEL: ApkgModel = {
  id: '12',
  name: 'Pays',
  type: 0,
  fields: ['Pays', 'Capitale', 'Indice'],
  templates: [
    { name: 'Pays', qfmt: '{{Pays}}', afmt: '{{FrontSide}}<hr id=answer>{{Capitale}}' },
    { name: 'Capitale', qfmt: '{{Capitale}}', afmt: '{{FrontSide}}<hr id=answer>{{Pays}}' },
    {
      name: 'Indice',
      qfmt: '{{#Indice}}{{Indice}} ?{{/Indice}}',
      afmt: '{{FrontSide}}<hr id=answer>{{Pays}}',
    },
  ],
}

/** An Anki card in the state of a review card due 20 days after day 0 (interval 30 days). */
export const REVIEW_STATE = {
  type: 2,
  queue: 2,
  due: 20,
  ivl: 30,
  factor: 2500,
  reps: 4,
  lapses: 1,
}

export interface AnkiNote {
  /** Anki note id: its creation time in ms. */
  id: number
  guid: string
  model: ApkgModel
  fields: string[]
  /** Modification time in seconds: a re-import updates the note when it is more recent. */
  mod: number
  tags?: string[]
  /** The cards Anki has for the note: an ord (a new card) or a card with its state. */
  cards: (number | (Partial<ApkgCard> & { ord: number }))[]
}

export const ankiCardId = (noteId: number, ord: number) => noteId * 100 + ord

/** One answer in Anki's review log (type 1: a review, ease 3: Good). */
export function ankiReview(noteId: number, ord: number, at: number, ease = 3): ApkgRevlog {
  return { id: at, cid: ankiCardId(noteId, ord), ease, time: 5000, type: 1 }
}

/** A package as `readApkg` would return it: one deck « Géographie », the given notes and log. */
export function ankiPackage(notes: AnkiNote[], revlog: ApkgRevlog[] = []): ApkgPackage {
  const models = new Map(notes.map((n) => [n.model.id, n.model]))
  return {
    format: 'anki21',
    crt: CRT,
    models: [...models.values()],
    decks: [{ id: '2', name: 'Géographie' }],
    notes: notes.map((n) => ({
      id: n.id,
      guid: n.guid,
      mid: n.model.id,
      mod: n.mod,
      tags: n.tags ?? [],
      fields: n.fields,
    })),
    cards: notes.flatMap((n) =>
      n.cards.map((spec) => {
        const patch = typeof spec === 'number' ? { ord: spec } : spec
        return {
          id: ankiCardId(n.id, patch.ord),
          nid: n.id,
          did: '2',
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
          ...patch,
        }
      }),
    ),
    revlog,
    media: [],
    missingMedia: [],
    size: 0,
  }
}
