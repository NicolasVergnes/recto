import { clozeAnswers, clozeIndices, renderClozeAnswer, renderClozeQuestion } from './cloze'
import type { Card, ModelType, Note } from './types'

/** Number of fields per model: basic [front, back, extra], cloze [text, extra]. */
export function fieldCount(modelType: ModelType): number {
  return modelType === 'cloze' ? 2 : 3
}

/** Pads or trims `fields` to the model's field count. */
export function normalizeFields(modelType: ModelType, fields: readonly string[]): string[] {
  const n = fieldCount(modelType)
  return Array.from({ length: n }, (_, i) => fields[i] ?? '')
}

/**
 * Card ords a note must have (02-DATA-MODEL §3 invariant 2): basic → [0], basic_reverse → [0, 1],
 * cloze → one per distinct index (ord = index - 1).
 */
export function cardOrds(modelType: ModelType, fields: readonly string[]): number[] {
  if (modelType === 'basic') return [0]
  if (modelType === 'basic_reverse') return [0, 1]
  return clozeIndices(fields[0] ?? '').map((i) => i - 1)
}

/** The duplicate/sort key of a note: its first field (front or cloze text). */
export function noteFront(note: Pick<Note, 'fields'>): string {
  return note.fields[0] ?? ''
}

export interface RenderedCard {
  /** Question side HTML (unsanitised). */
  question: string
  /** Answer HTML: the back for basic cards, the revealed text for cloze. */
  answer: string
  extra: string
  /** Cloze: the answer replaces the question instead of being shown below it. */
  answerReplacesQuestion: boolean
  /** Leitner alternateSides: the back is asked (04-UI §2.2, "↔" indicator). */
  flipped: boolean
  /** Expected text for typed answers. */
  expected: string
}

/**
 * Question/answer of a card. `flip` applies Leitner `sideFlipped` (ignored for cloze, 03 §3.3).
 */
export function renderCard(
  note: Pick<Note, 'modelType' | 'fields'>,
  card: Pick<Card, 'ord' | 'sideFlipped'>,
  flip = false,
): RenderedCard {
  const [f0 = '', f1 = '', f2 = ''] = note.fields
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

/** Maps fields when the note type changes in the editor (basic ↔ cloze keeps front and extra). */
export function convertFields(from: ModelType, to: ModelType, fields: readonly string[]): string[] {
  const isCloze = (m: ModelType) => m === 'cloze'
  if (isCloze(from) === isCloze(to)) return normalizeFields(to, fields)
  const [a = '', b = '', c = ''] = fields
  return isCloze(to) ? [a, c || b] : [a, '', b]
}
