import { clozeAnswers, clozeIndices, renderClozeAnswer, renderClozeQuestion } from './cloze'
import {
  maskLabels,
  occlusionOrds,
  parseOcclusion,
  type OcclusionMask,
  type OcclusionMode,
} from './occlusion'
import { fieldValues, renderTemplate, templateOrds, typedField } from './templates'
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

/**
 * Card ords a note must have (02-DATA-MODEL §3 invariant 2): basic → [0], basic_reverse → [0, 1],
 * cloze → one per distinct index (ord = index - 1), image_occlusion → one per mask group
 * (ord = group - 1), custom → one per template whose question is not empty (none without its
 * note type).
 */
export function cardOrds(
  modelType: ModelType,
  fields: readonly string[],
  noteType?: TypeShape,
): number[] {
  switch (modelType) {
    case 'basic':
      return [0]
    case 'basic_reverse':
      return [0, 1]
    case 'cloze':
      return clozeIndices(fields[0] ?? '').map((i) => i - 1)
    case 'image_occlusion':
      return occlusionOrds(parseOcclusion(fields[1] ?? ''))
    case 'custom':
      return noteType ? templateOrds(noteType, fields) : []
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
  /** The mask group asked by this card (card ord + 1). */
  target: number
}

export interface RenderedCard {
  /** Question side HTML (unsanitised); the header for image occlusion. */
  question: string
  /** Answer HTML: the back for basic cards, the revealed text for cloze, the labels for occlusion. */
  answer: string
  extra: string
  /** Cloze: the answer replaces the question instead of being shown below it. */
  answerReplacesQuestion: boolean
  /** Leitner alternateSides: the back is asked (04-UI §2.2, "↔" indicator). */
  flipped: boolean
  /** Expected text for typed answers (empty: nothing to type). */
  expected: string
  /** Image occlusion only: drawn by the review and preview components, not by CardContent. */
  occlusion?: OcclusionCard
}

/**
 * Question/answer of a custom note's card: its template rendered like Anki, the answer side
 * replacing the question (it usually repeats it through `{{FrontSide}}`).
 */
function renderCustom(
  fields: readonly string[],
  ord: number,
  noteType: TypeShape | undefined,
): RenderedCard {
  const template = noteType?.templates[ord]
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
  const values = fieldValues(noteType.fields, fields)
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
 * Question/answer of a card. `flip` applies Leitner `sideFlipped` (ignored for cloze and custom
 * notes, 03 §3.3). A custom note needs its note type.
 */
export function renderCard(
  note: Pick<Note, 'modelType' | 'fields'>,
  card: Pick<Card, 'ord' | 'sideFlipped'>,
  flip = false,
  noteType?: TypeShape,
): RenderedCard {
  if (note.modelType === 'custom') return renderCustom(note.fields, card.ord, noteType)
  const [f0 = '', f1 = '', f2 = '', f3 = ''] = note.fields
  if (note.modelType === 'image_occlusion') {
    const occlusion = parseOcclusion(f1)
    const target = card.ord + 1
    // Labels are plain text: escaped once, they are HTML like every other side.
    const labels = escapeHtml(maskLabels(occlusion, target).join(', '))
    const image = imageRefs(f0)[0]
    return {
      question: f2,
      // P1: the labels are part of the answer, never rendered before the reveal.
      answer: labels,
      extra: f3,
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
  if (note.modelType === 'cloze') {
    const index = card.ord + 1
    return {
      question: renderClozeQuestion(f0, index),
      answer: renderClozeAnswer(f0, index),
      extra: f1,
      answerReplacesQuestion: true,
      flipped: false,
      expected: clozeAnswers(f0, index).join(', '),
    }
  }
  const reverse = card.ord === 1
  const flipped = flip && card.sideFlipped
  const askBack = reverse !== flipped
  const question = askBack ? f1 : f0
  const answer = askBack ? f0 : f1
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
