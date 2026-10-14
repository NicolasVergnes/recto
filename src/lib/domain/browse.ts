import { byFormatOrder, cardFormat, formatName, type CardFormat, type FormatName } from './formats'
import { stripHtml } from './text'
import { renderCard } from './notes'
import type { Card, Note, NoteType } from './types'

/** Display status of a card in the browser and statistics (states.* in fr.ts). */
export type CardStatus = 'new' | 'learning' | 'review' | 'relearning' | 'suspended' | 'retired'

export function cardStatus(card: Pick<Card, 'state' | 'suspended' | 'retired'>): CardStatus {
  if (card.retired) return 'retired'
  if (card.suspended) return 'suspended'
  return (['new', 'learning', 'review', 'relearning'] as const)[card.state]
}

export interface BrowserRow {
  card: Card
  note: Note
  /** custom notes: their note type (rendering). */
  noteType?: NoteType
  deckName: string
  question: string
  answer: string
  status: CardStatus
}

/** The answer side without the question it repeats (Anki's `<hr id=answer>` convention). */
function answerOnly(answer: string, question: string): string {
  const hr = /<hr\s+id\s*=\s*["']?answer["']?\s*\/?>/i.exec(answer)
  if (hr) return answer.slice(hr.index + hr[0].length)
  return answer.startsWith(question) ? answer.slice(question.length) : answer
}

export function buildRow(
  card: Card,
  note: Note,
  deckName: string,
  noteType?: NoteType,
): BrowserRow {
  const r = renderCard(note, card, false, noteType)
  const occlusion = r.occlusion
  // Occlusion: "header (or image) #group" (no group: a single card) and the mask labels (or the
  // extra).
  const group = occlusion?.target ? ` #${occlusion.target}` : ''
  const question = occlusion
    ? `${stripHtml(r.question) || occlusion.alt || occlusion.image}${group}`
    : stripHtml(r.question)
  const answer = occlusion
    ? stripHtml(r.expected) || stripHtml(r.extra)
    : note.modelType === 'custom'
      ? stripHtml(answerOnly(r.answer, r.question))
      : stripHtml(r.answerReplacesQuestion ? r.extra : r.answer)
  const row: BrowserRow = { card, note, deckName, question, answer, status: cardStatus(card) }
  if (noteType) row.noteType = noteType
  return row
}

export type StatusFilter = CardStatus | 'flagged' | ''

export interface BrowserFilter {
  deckIds: readonly string[] | null
  q: string
  tag: string
  status: StatusFilter
  /** M17: a card format key (formats.ts); empty or absent: every format. */
  format?: string
}

export type SortKey = 'question' | 'answer' | 'deck' | 'status' | 'due' | 'created'
export interface Sort {
  key: SortKey
  dir: 1 | -1
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function filterRows(rows: readonly BrowserRow[], f: BrowserFilter): BrowserRow[] {
  const q = fold(f.q.trim())
  const decks = f.deckIds ? new Set(f.deckIds) : null
  return rows.filter((row) => {
    if (decks && !decks.has(row.card.deckId)) return false
    if (f.tag && !row.note.tags.includes(f.tag)) return false
    if (f.format && cardFormat(row.note, row.card).key !== f.format) return false
    if (f.status === 'flagged' ? row.card.flag === 0 : f.status && row.status !== f.status) {
      return false
    }
    if (q && !fold(`${row.question} ${row.answer} ${row.note.tags.join(' ')}`).includes(q)) {
      return false
    }
    return true
  })
}

/** The formats of the rows (M17), for the « Format de carte » filter. */
export function rowFormats(rows: readonly BrowserRow[]): (FormatName & CardFormat)[] {
  const formats = new Map<string, FormatName & CardFormat>()
  for (const { note, card, noteType } of rows) {
    const key = cardFormat(note, card).key
    if (!formats.has(key)) formats.set(key, formatName(note, card, noteType))
  }
  return [...formats.values()].sort(byFormatOrder)
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

export function sortRows(rows: readonly BrowserRow[], sort: Sort): BrowserRow[] {
  const value = (r: BrowserRow): string | number => {
    switch (sort.key) {
      case 'question':
        return r.question
      case 'answer':
        return r.answer
      case 'deck':
        return r.deckName
      case 'status':
        return r.status
      case 'due':
        return r.card.due
      case 'created':
        return r.card.createdAt
    }
  }
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const c =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : collator.compare(String(va), String(vb))
    return (c || a.card.ord - b.card.ord) * sort.dir
  })
}
