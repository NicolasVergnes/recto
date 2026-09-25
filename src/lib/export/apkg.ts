/**
 * Recto → Anki legacy package (05-IMPORT-EXPORT §4): `collection.anki21` (SQLite schema 11,
 * scheduler v2), `media` JSON map and numbered media entries, zipped with fflate. Pure: sql.js is
 * given as a parameter (loaded in a worker) and `now` too; async only for SHA-1 (Web Crypto).
 */
import { strToU8, zipSync, type Zippable } from 'fflate'
import type { SqlJsStatic } from 'sql.js'
import { deckPath } from '../domain/decks'
import { normalizeFields } from '../domain/notes'
import { decodeEntities, escapeHtml, mediaRefs } from '../domain/text'
import type { Card, Deck, ModelType, Note, Review } from '../domain/types'
import { dayStart, daysBetween } from '../scheduler/day'

export interface ApkgExportMedia {
  name: string
  data: Uint8Array<ArrayBuffer>
}

export interface ApkgExportInput {
  /** Decks of the exported cards and their parents. */
  decks: readonly Deck[]
  notes: readonly Note[]
  /** Cards of the exported notes (others are ignored). */
  cards: readonly Card[]
  /** Reviews of the exported cards (others are ignored). */
  reviews: readonly Review[]
  /** Media referenced by the notes; unreferenced ones are left out. */
  media: readonly ApkgExportMedia[]
}

export interface ApkgExportOptions {
  now: number
  dayStartHour: number
}

export interface ApkgExportReport {
  decks: number
  notes: number
  cards: number
  reviews: number
  media: number
  /** Referenced by a field but absent from the media table. */
  missingMedia: string[]
  /** Retired cards (P7): Anki has no equivalent, they are exported as suspended. */
  retired: number
}

export interface ApkgExportResult {
  bytes: Uint8Array<ArrayBuffer>
  report: ApkgExportReport
}

/**
 * Fixed note type ids, names and modification time: a second import into Anki reuses the note
 * types (no "Basic+" copies) and never overwrites one the user edited there.
 */
export const ANKI_MODEL_IDS: Record<ModelType, number> = {
  basic: 1758758400001,
  basic_reverse: 1758758400002,
  cloze: 1758758400003,
}
const MODEL_MOD = 1758758400
const DEFAULT_DECK_ID = 1
const MAX_DURATION_MS = 60_000
const HOUR_MS = 3_600_000

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);`

const CSS =
  '.card { font-family: sans-serif; font-size: 20px; text-align: center; color: black; background-color: white; }\n.cloze { font-weight: bold; color: blue; }'
const LATEX_PRE =
  '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n'
const extra = '{{#Extra}}<br><br>{{Extra}}{{/Extra}}'
const back = (field: string) => `{{FrontSide}}\n\n<hr id=answer>\n\n{{${field}}}${extra}`

const field = (name: string, ord: number) => ({
  name,
  ord,
  sticky: false,
  rtl: false,
  font: 'Arial',
  size: 20,
  media: [],
})
const template = (name: string, ord: number, qfmt: string, afmt: string) => ({
  name,
  ord,
  qfmt,
  afmt,
  bqfmt: '',
  bafmt: '',
  did: null,
  bfont: '',
  bsize: 0,
})

function model(type: ModelType) {
  const id = ANKI_MODEL_IDS[type]
  const common = {
    id,
    mod: MODEL_MOD,
    usn: -1,
    sortf: 0,
    did: DEFAULT_DECK_ID,
    css: CSS,
    latexPre: LATEX_PRE,
    latexPost: '\\end{document}',
    latexsvg: false,
    tags: [],
    vers: [],
  }
  if (type === 'cloze')
    return {
      ...common,
      name: 'Recto · Texte à trous',
      type: 1,
      flds: [field('Texte', 0), field('Extra', 1)],
      tmpls: [template('Texte à trous', 0, '{{cloze:Texte}}', `{{cloze:Texte}}${extra}`)],
      req: [[0, 'any', [0]]],
    }
  const reverse = type === 'basic_reverse'
  const forward = template('Recto → Verso', 0, '{{Recto}}', back('Verso'))
  return {
    ...common,
    name: reverse ? 'Recto · Basique et inversée' : 'Recto · Basique',
    type: 0,
    flds: [field('Recto', 0), field('Verso', 1), field('Extra', 2)],
    tmpls: reverse
      ? [forward, template('Verso → Recto', 1, '{{Verso}}', back('Recto'))]
      : [forward],
    req: reverse
      ? [
          [0, 'any', [0]],
          [1, 'any', [1]],
        ]
      : [[0, 'any', [0]]],
  }
}

function ankiDeck(id: number, name: string, desc: string, mod: number) {
  return {
    id,
    name,
    mod,
    usn: -1,
    desc,
    dyn: 0,
    conf: 1,
    collapsed: false,
    browserCollapsed: false,
    extendNew: 0,
    extendRev: 0,
    newToday: [0, 0],
    revToday: [0, 0],
    lrnToday: [0, 0],
    timeToday: [0, 0],
  }
}

const DECK_CONF = {
  1: {
    id: 1,
    name: 'Default',
    mod: 0,
    usn: 0,
    maxTaken: 60,
    autoplay: true,
    timer: 0,
    replayq: true,
    dyn: false,
    new: {
      bury: false,
      delays: [10, 10],
      initialFactor: 2500,
      ints: [1, 4, 0],
      order: 1,
      perDay: 20,
    },
    rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  },
}

/**
 * Unique integer ids derived from timestamps (Anki ids are ms), bumped on collision. Callers ask
 * in ascending order (rows sorted by time), so the next free id is the last one + 1: O(1), even
 * when thousands of cards share a timestamp (CSV reverse and cloze notes). Ids stay > `floor`.
 */
export function idAllocator(floor = 0) {
  let last = floor
  return (wanted: number): number => {
    last = Math.max(Number.isFinite(wanted) ? Math.floor(wanted) : 0, last + 1)
    return last
  }
}

const IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi

/** Anki's sort field: HTML removed, image names kept (Anki recomputes it on import anyway). */
export function sortField(html: string): string {
  return decodeEntities(
    html
      .replace(IMG_RE, (_m, a?: string, b?: string, c?: string) => ` ${a ?? b ?? c ?? ''} `)
      .replace(/<[^>]*>/g, ''),
  )
}

/** Anki's duplicate checksum: first 8 hex digits of SHA-1(sort field) as an integer. */
export async function fieldChecksum(text: string): Promise<number> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return new DataView(digest).getUint32(0)
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Ease (‰) from an FSRS difficulty: the inverse of the import formula (05 §2.3). */
export const easeFromDifficulty = (d: number) => clamp(Math.round((11 - d) * 500), 1300, 5000)

interface CardContext {
  deck: Deck | undefined
  /** Collection creation (ms): base of review `due` in days. */
  crt: number
  dayStartHour: number
  newPosition: number
}

/** Card state (05 §4): New/Learning/Review/Relearning → Anki type, queue, due, ivl, factor… */
export function toAnkiCard(card: Card, ctx: CardContext) {
  // Retired (P7) has no Anki equivalent: suspended, like suspended cards.
  const queue = (q: number) => (card.suspended || card.retired ? -1 : q)
  if (card.state === 0)
    return { type: 0, queue: queue(0), due: ctx.newPosition, ivl: 0, factor: 0, left: 0, data: '' }
  const fsrs = ctx.deck?.scheduler !== 'leitner'
  const settings = ctx.deck?.settings.fsrs
  const memory = fsrs && settings && card.stability > 0 && card.difficulty > 0
  const factor = memory ? easeFromDifficulty(card.difficulty) : 2500
  // FSRS memory state (Leitner stabilities mean nothing) and last review time, which Anki's
  // "Check database" would otherwise add.
  const extra = {
    ...(memory ? { s: card.stability, d: card.difficulty, dr: settings.requestRetention } : {}),
    ...(card.lastReview === null ? {} : { lrt: Math.floor(card.lastReview / 1000) }),
  }
  const data = Object.keys(extra).length > 0 ? JSON.stringify(extra) : ''
  if (card.state === 2) {
    const due = daysBetween(ctx.crt, card.due, ctx.dayStartHour)
    const ivl = Math.max(1, card.scheduledDays)
    return { type: 2, queue: queue(2), due, ivl, factor, left: 0, data }
  }
  const relearning = card.state === 3
  const steps = (relearning ? settings?.relearningSteps : settings?.learningSteps)?.length ?? 1
  return {
    type: relearning ? 3 : 1,
    queue: queue(1),
    due: Math.floor(card.due / 1000),
    ivl: relearning ? Math.max(1, Math.round(card.stability)) : 0,
    factor,
    left: fsrs ? Math.max(1, steps - card.learningSteps) : 1,
    data,
  }
}

/** Review log row (05 §4): ivl in days, or negative seconds for (re)learning steps. */
export function toRevlog(review: Review, lastIvl: number) {
  const learning = review.stateAfter === 1 || review.stateAfter === 3
  const ivl = learning
    ? 0 - Math.round(Math.max(0, review.dueAfter - review.reviewedAt) / 1000)
    : Math.max(1, review.scheduledDays)
  const factor =
    review.scheduler === 'fsrs' && review.difficultyBefore > 0
      ? easeFromDifficulty(review.difficultyBefore)
      : 2500
  const type = review.stateBefore === 3 ? 2 : review.stateBefore === 2 ? 1 : 0
  const time = clamp(Math.round(review.durationMs), 0, MAX_DURATION_MS)
  return { ease: review.rating, ivl, lastIvl, factor, time, type }
}

const compareIds = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** Builds the `.apkg` bytes and a short report. */
export async function buildApkg(
  SQL: SqlJsStatic,
  input: ApkgExportInput,
  options: ApkgExportOptions,
): Promise<ApkgExportResult> {
  const { now, dayStartHour } = options
  // A note without cards would be removed by Anki's "Check database".
  const withCards = new Set(input.cards.map((c) => c.noteId))
  const notes = input.notes
    .filter((n) => withCards.has(n.id))
    .sort((a, b) => a.createdAt - b.createdAt || compareIds(a, b))
  const noteIds = new Set(notes.map((n) => n.id))
  const cards = input.cards
    .filter((c) => noteIds.has(c.noteId))
    .sort((a, b) => a.createdAt - b.createdAt || a.ord - b.ord || compareIds(a, b))
  const cardIds = new Set(cards.map((c) => c.id))
  const reviews = input.reviews
    .filter((r) => cardIds.has(r.cardId))
    .sort((a, b) => a.reviewedAt - b.reviewedAt || compareIds(a, b))
  const sorted = await Promise.all(
    notes.map(async (note) => {
      const sfld = sortField(note.fields[0] ?? '')
      return { note, sfld, csum: await fieldChecksum(sfld) }
    }),
  )

  // Media: only files referenced by the exported fields; the absent ones are reported.
  const available = new Map(input.media.map((m) => [m.name, m]))
  const included: ApkgExportMedia[] = []
  const missing = new Set<string>()
  const seen = new Set<string>()
  for (const note of notes)
    for (const html of note.fields) {
      const refs = mediaRefs(html)
      for (const name of [...refs.images, ...refs.sounds]) {
        if (seen.has(name)) continue
        seen.add(name)
        const media = available.get(name)
        if (media) included.push(media)
        else missing.add(name)
      }
    }

  // Decks: `Parent::Child`, always with Anki's Default deck (id 1), which a top-level deck named
  // "Default" reuses: Anki's deck names are unique regardless of case (so are Recto's siblings).
  const deckById = new Map(input.decks.map((d) => [d.id, d]))
  const deckIds = new Map<string, number>()
  const newDeckId = idAllocator(DEFAULT_DECK_ID)
  const decksJson: Record<number, ReturnType<typeof ankiDeck>> = {}
  const decks = [...input.decks].sort((a, b) => a.createdAt - b.createdAt || compareIds(a, b))
  for (const deck of decks) {
    const name = deckPath(deck, deckById)
    const id = name.toLowerCase() === 'default' ? DEFAULT_DECK_ID : newDeckId(deck.createdAt)
    deckIds.set(deck.id, id)
    const desc = escapeHtml(deck.description ?? '')
    decksJson[id] = ankiDeck(id, name, desc, Math.floor(deck.updatedAt / 1000))
  }
  decksJson[DEFAULT_DECK_ID] ??= ankiDeck(DEFAULT_DECK_ID, 'Default', '', Math.floor(now / 1000))

  // `crt`: Anki's day 0 is its local date, here the study day of the earliest review due (or
  // today), so that every `due` (days since crt) is ≥ 0; `creationOffset` (its UTC offset) makes
  // Anki read that date as written, whatever the offset at import time. Halfway between the day
  // start and midnight: `crt + due × 86 400 s` (Recto's import) stays in the right study day
  // across a DST change, for a day start up to 22:00 (05 §4).
  const earliest = cards.reduce((min, c) => (c.state === 2 ? Math.min(min, c.due) : min), now)
  const crt = dayStart(earliest, dayStartHour) + ((24 - dayStartHour) / 2) * HOUR_MS

  const db = new SQL.Database()
  try {
    db.exec(SCHEMA)
    db.exec('BEGIN')
    const newNoteId = idAllocator()
    const ankiNoteIds = new Map<string, number>()
    const insertNote = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, ?)')
    for (const { note, sfld, csum } of sorted) {
      const id = newNoteId(note.createdAt)
      ankiNoteIds.set(note.id, id)
      const fields = normalizeFields(note.modelType, note.fields)
      insertNote.run([
        id,
        note.sourceGuid ?? note.id,
        ANKI_MODEL_IDS[note.modelType],
        Math.floor(note.updatedAt / 1000),
        note.tags.length > 0 ? ` ${note.tags.join(' ')} ` : '',
        fields.map((f) => f.split('\u001f').join('')).join('\u001f'),
        sfld,
        csum,
        '',
      ])
    }
    insertNote.free()

    const newCardId = idAllocator()
    const ankiCardIds = new Map<string, number>()
    const positions = new Map<string, number>()
    let retired = 0
    const insertCard = db.prepare(
      'INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)',
    )
    for (const card of cards) {
      const id = newCardId(card.createdAt)
      ankiCardIds.set(card.id, id)
      // New cards: Anki's position, shared by the cards of a note, in creation order.
      let newPosition = 0
      if (card.state === 0) {
        newPosition = positions.get(card.noteId) ?? positions.size + 1
        positions.set(card.noteId, newPosition)
      }
      if (card.retired) retired++
      const deck = deckById.get(card.deckId)
      const a = toAnkiCard(card, { deck, crt, dayStartHour, newPosition })
      insertCard.run([
        id,
        ankiNoteIds.get(card.noteId) ?? 0,
        deckIds.get(card.deckId) ?? DEFAULT_DECK_ID,
        card.ord,
        Math.floor((card.lastReview ?? card.createdAt) / 1000),
        a.type,
        a.queue,
        a.due,
        a.ivl,
        a.factor,
        card.reps,
        card.lapses,
        a.left,
        card.flag,
        a.data,
      ])
    }
    insertCard.free()

    const newRevlogId = idAllocator()
    const lastIvl = new Map<string, number>()
    const insertRevlog = db.prepare('INSERT INTO revlog VALUES (?, ?, -1, ?, ?, ?, ?, ?, ?)')
    for (const review of reviews) {
      const row = toRevlog(review, lastIvl.get(review.cardId) ?? 0)
      lastIvl.set(review.cardId, row.ivl)
      insertRevlog.run([
        newRevlogId(review.reviewedAt),
        ankiCardIds.get(review.cardId) ?? 0,
        row.ease,
        row.ivl,
        row.lastIvl,
        row.factor,
        row.time,
        row.type,
      ])
    }
    insertRevlog.free()

    const conf = {
      schedVer: 2,
      rollover: dayStartHour,
      creationOffset: new Date(crt).getTimezoneOffset(),
      activeDecks: [DEFAULT_DECK_ID],
      curDeck: DEFAULT_DECK_ID,
      curModel: ANKI_MODEL_IDS.basic,
      nextPos: positions.size + 1,
      newSpread: 0,
      collapseTime: 1200,
      timeLim: 0,
      estTimes: true,
      dueCounts: true,
      sortType: 'noteFld',
      sortBackwards: false,
      addToCur: true,
    }
    const models = Object.fromEntries(
      (['basic', 'basic_reverse', 'cloze'] as const).map((t) => [ANKI_MODEL_IDS[t], model(t)]),
    )
    db.run('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
      Math.floor(crt / 1000),
      now,
      now,
      JSON.stringify(conf),
      JSON.stringify(models),
      JSON.stringify(decksJson),
      JSON.stringify(DECK_CONF),
      '{}',
    ])
    db.exec('COMMIT')

    const files: Zippable = {
      'collection.anki21': db.export(),
      media: strToU8(JSON.stringify(Object.fromEntries(included.map((m, i) => [i, m.name])))),
    }
    // Media are already compressed: stored as is.
    included.forEach((m, i) => (files[String(i)] = [m.data, { level: 0 }]))
    return {
      bytes: new Uint8Array(zipSync(files, { level: 6 })),
      report: {
        decks: input.decks.length,
        notes: notes.length,
        cards: cards.length,
        reviews: reviews.length,
        media: included.length,
        missingMedia: [...missing].sort(),
        retired,
      },
    }
  } finally {
    db.close()
  }
}
