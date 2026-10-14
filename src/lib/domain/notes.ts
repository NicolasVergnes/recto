import { clozeAnswers, clozeIndices, renderClozeAnswer, renderClozeQuestion } from './cloze'
import {
  maskLabels,
  occlusionGroups,
  occlusionOrds,
  parseOcclusion,
  type Occlusion,
  type OcclusionMask,
  type OcclusionMode,
} from './occlusion'
import {
  fieldValues,
  kindOf,
  renderTemplate,
  subIndex,
  templateIndex,
  templateOrds,
  typedField,
} from './templates'
import { escapeHtml, imageRefs, imageTag, removeImage, stripHtml } from './text'
import type { Card, ModelType, Note, NoteType } from './types'

/** What a custom note needs from its note type (the other types ignore it). */
export type TypeShape = Pick<NoteType, 'fields' | 'templates'>

/**
 * Number of fields per model: basic [front, back, extra], cloze [text, extra],
 * image_occlusion [image, masks JSON, header, extra], custom: its note type's fields.
 */
export function fieldCount(modelType: ModelType, noteType?: TypeShape): number {
  switch (modelType) {
    case 'cloze':
      return 2
    case 'image_occlusion':
      return 4
    case 'custom':
      return noteType?.fields.length ?? 0
    default:
      return 3
  }
}

/** Pads or trims `fields` to the model's field count (a custom note without its type: as is). */
export function normalizeFields(
  modelType: ModelType,
  fields: readonly string[],
  noteType?: TypeShape,
): string[] {
  const n = modelType === 'custom' && !noteType ? fields.length : fieldCount(modelType, noteType)
  return Array.from({ length: n }, (_, i) => fields[i] ?? '')
}

/** What generating the cards of a note reads. */
export type NoteContent = Pick<Note, 'modelType' | 'fields' | 'single' | 'masks'>

/** A single note keeps one card, the first one's ord (0), when its content asks anything. */
const singly = (ords: number[], single: boolean | undefined) =>
  single && ords.length > 0 ? [0] : ords

/**
 * Card ords a note must have (02-DATA-MODEL §3 invariant 2): basic → [0] (one card for both sides),
 * cloze → one per distinct index (ord = index - 1), image_occlusion → one per mask group
 * (ord = group - 1), both [0] when `single` (M14); custom → the cards of its templates
 * (`templateOrds`; none without its note type).
 */
export function cardOrds(note: NoteContent, noteType?: TypeShape): number[] {
  const { fields } = note
  switch (note.modelType) {
    case 'basic':
      return [0]
    case 'cloze':
      return singly(
        clozeIndices(fields[0] ?? '').map((i) => i - 1),
        note.single,
      )
    case 'image_occlusion':
      return singly(occlusionOrds(parseOcclusion(fields[1] ?? '')), note.single)
    case 'custom':
      return noteType ? templateOrds(noteType, fields, note.masks) : []
  }
}

/** What reconciling the cards of a note needs to know about each one (a stored `Card` has it all). */
export type ReconcilableCard = Pick<Card, 'id' | 'noteId' | 'ord' | 'lastReview' | 'reps'>

/**
 * Orders copies of a card, the one to keep first: the most recently reviewed, then the one with
 * the most repetitions. Backup merges and `reconcileCards` share this single rule.
 */
export function byRecency(
  a: Pick<Card, 'lastReview' | 'reps'>,
  b: Pick<Card, 'lastReview' | 'reps'>,
): number {
  return (b.lastReview ?? -1) - (a.lastReview ?? -1) || b.reps - a.reps
}

export interface CardReconciliation<C extends ReconcilableCard> {
  /** Cards that stay: one per wanted ord that already has a card, in the order of `ords`. */
  keep: C[]
  /** Wanted ords without a card: each needs a new one. */
  create: number[]
  /** Cards to delete, their review log kept: an ord no longer generated, or a second copy. */
  remove: C[]
}

/**
 * Invariant 2 for one note (02-DATA-MODEL §3), shared by every writer that changes a note's
 * content outside the editor (re-import, backup merge) and by the editor itself: given the cards
 * it has and the ords its content generates (`cardOrds`), which cards stay, which ords need a
 * new card and which cards go. A card whose ord is not generated goes; when several cards share
 * a generated ord, the most recently reviewed stays (`byRecency`) and the others go. Cards are
 * matched by their ord only: a card keeps its schedule and its log with what it asks.
 */
export function reconcileCards<C extends ReconcilableCard>(
  cards: readonly C[],
  ords: readonly number[],
): CardReconciliation<C> {
  const wanted = new Set(ords)
  const stay = new Map<number, C>()
  for (const card of [...cards].sort(byRecency)) {
    if (wanted.has(card.ord) && !stay.has(card.ord)) stay.set(card.ord, card)
  }
  const kept = new Set(stay.values())
  return {
    keep: ords.flatMap((ord) => stay.get(ord) ?? []),
    create: ords.filter((ord) => !stay.has(ord)),
    remove: cards.filter((card) => !kept.has(card)),
  }
}

/** The duplicate/sort key of a note: its first field (front or cloze text). */
export function noteFront(note: Pick<Note, 'fields'>): string {
  return note.fields[0] ?? ''
}

/** What an image occlusion card draws: the image, its masks and the group being asked. */
export interface OcclusionCard {
  /** Media name of the image (empty when the note has none). */
  image: string
  alt: string
  mode: OcclusionMode
  masks: OcclusionMask[]
  /** The mask group asked by this card (card ord + 1), or null: every group (single card, M14). */
  target: number | null
}

export interface RenderedCard {
  /** Question side HTML (unsanitised); the header for image occlusion. */
  question: string
  /** Answer HTML: the back for basic cards, the revealed text for cloze, the labels for occlusion. */
  answer: string
  extra: string
  /** Cloze: the answer replaces the question instead of being shown below it. */
  answerReplacesQuestion: boolean
  /** Deck alternateSides: the back is asked (04-UI §2.2, "↔" indicator). */
  flipped: boolean
  /** Expected text for typed answers (empty: nothing to type). */
  expected: string
  /** Image occlusion only: drawn by the review and preview components, not by CardContent. */
  occlusion?: OcclusionCard
}

/** A cloze card: deletion `index`, or every one (null), then what the answer adds. */
function renderCloze(text: string, index: number | null, extra: string): RenderedCard {
  return {
    question: renderClozeQuestion(text, index),
    answer: renderClozeAnswer(text, index),
    extra,
    answerReplacesQuestion: true,
    flipped: false,
    expected: clozeAnswers(text, index).join(', '),
  }
}

/** An occlusion card: group `target`, or every one (null), under its header. */
function renderOcclusion(
  imageField: string,
  occlusion: Occlusion,
  target: number | null,
  header: string,
  extra: string,
): RenderedCard {
  const groups = target === null ? occlusionGroups(occlusion) : [target]
  // Labels are plain text: escaped once, they are HTML like every other side.
  const labels = escapeHtml(
    [...new Set(groups.flatMap((n) => maskLabels(occlusion, n)))].join(', '),
  )
  const image = imageRefs(imageField)[0]
  return {
    question: header,
    // P1: the labels are part of the answer, never rendered before the reveal.
    answer: labels,
    extra,
    answerReplacesQuestion: false,
    flipped: false,
    expected: labels,
    occlusion: {
      image: image?.name ?? '',
      alt: image?.alt ?? '',
      mode: occlusion.mode,
      masks: occlusion.masks,
      target,
    },
  }
}

/**
 * Question/answer of a custom note's card, by the kind of its template (M14). Classic: the
 * template rendered like Anki, the answer side replacing the question (it usually repeats it
 * through `{{FrontSide}}`). Cloze and occlusion: the text or image of `template.field`, the
 * template's back added to the answer and its front as the occlusion header.
 */
function renderCustom(
  note: Pick<Note, 'fields' | 'masks'>,
  ord: number,
  noteType: TypeShape | undefined,
): RenderedCard {
  const template = noteType?.templates[templateIndex(ord)]
  if (!noteType || !template) {
    return {
      question: '',
      answer: '',
      extra: '',
      answerReplacesQuestion: true,
      flipped: false,
      expected: '',
    }
  }
  const values = fieldValues(noteType.fields, note.fields)
  const kind = kindOf(template)
  if (kind !== 'classic') {
    const at = noteType.fields.indexOf(template.field ?? '')
    const source = note.fields[at] ?? ''
    const asked = template.single ? null : subIndex(ord) + 1
    const extra = renderTemplate(template.back, values)
    if (kind === 'cloze') return renderCloze(source, asked, extra)
    const occlusion = parseOcclusion(note.masks?.[at] ?? '')
    return renderOcclusion(source, occlusion, asked, renderTemplate(template.front, values), extra)
  }
  const question = renderTemplate(template.front, values)
  const typed = typedField(template)
  return {
    question,
    answer: renderTemplate(template.back, values, question),
    extra: '',
    answerReplacesQuestion: true,
    flipped: false,
    expected: typed ? (values.get(typed) ?? '') : '',
  }
}

/**
 * Question/answer of a card. `flip` (the deck's `alternateSides`) applies `sideFlipped` to a basic
 * note that is not `oneWay`; cloze, occlusion and custom notes keep their templates' side (03 §1.1).
 * A custom note needs its note type.
 */
export function renderCard(
  note: Pick<Note, 'modelType' | 'fields' | 'oneWay' | 'single' | 'masks'>,
  card: Pick<Card, 'ord' | 'sideFlipped'>,
  flip = false,
  noteType?: TypeShape,
): RenderedCard {
  if (note.modelType === 'custom') return renderCustom(note, card.ord, noteType)
  const [f0 = '', f1 = '', f2 = '', f3 = ''] = note.fields
  const asked = note.single ? null : card.ord + 1
  if (note.modelType === 'image_occlusion')
    return renderOcclusion(f0, parseOcclusion(f1), asked, f2, f3)
  if (note.modelType === 'cloze') return renderCloze(f0, asked, f1)
  const flipped = flip && card.sideFlipped && !note.oneWay
  const question = flipped ? f1 : f0
  const answer = flipped ? f0 : f1
  return {
    question,
    answer,
    extra: f2,
    answerReplacesQuestion: false,
    flipped,
    expected: answer,
  }
}

/** Joins the non-empty parts with a line break. */
const joinLines = (...parts: string[]) =>
  parts.filter((p) => stripHtml(p) !== '' || /<img\b/i.test(p)).join('<br>')

/**
 * Maps fields when the note type changes in the editor. The front (cloze text; occlusion header
 * then image) and the extra are kept. To an occlusion note, the first image found becomes its
 * image, the rest of the front its header, and the rest of the back joins the extra. To and from
 * a custom type, fields are copied by position (front, back, extra).
 */
export function convertFields(
  from: ModelType,
  to: ModelType,
  fields: readonly string[],
  toType?: TypeShape,
): string[] {
  if (from === to && to !== 'custom') return normalizeFields(to, fields)
  if (from === 'custom' && to === 'custom') return normalizeFields(to, fields, toType)
  const [a = '', b = '', c = '', d = ''] = fields
  const src =
    from === 'cloze'
      ? { front: a, back: '', extra: b }
      : from === 'image_occlusion'
        ? { front: joinLines(c, a), back: '', extra: d }
        : { front: a, back: b, extra: c }
  switch (to) {
    case 'cloze':
      return [src.front, src.extra || src.back]
    case 'image_occlusion': {
      const image = imageRefs([src.front, src.back, src.extra].join(' '))[0]
      const without = (html: string) => (image ? removeImage(html, image.name) : html)
      return [
        image ? imageTag(image.name, image.alt) : '',
        '',
        joinLines(without(src.front)),
        joinLines(without(src.back), without(src.extra)),
      ]
    }
    case 'custom':
      return normalizeFields(to, [src.front, src.back, src.extra], toType)
    default:
      return [src.front, src.back, src.extra]
  }
}
