import { stripHtml } from './text'
import { renderCard } from './notes'
import type { Card, Note } from './types'

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
  deckName: string
  question: string
  answer: string
  status: CardStatus
}

export function buildRow(card: Card, note: Note, deckName: string): BrowserRow {
  const r = renderCard(note, card)
  const occlusion = r.occlusion
  // Occlusion: "header (or image) #group" and the mask labels (or the extra).
  const question = occlusion
    ? `${stripHtml(r.question) || occlusion.alt || occlusion.image} #${occlusion.target}`
    : stripHtml(r.question)
  const answer = occlusion
    ? stripHtml(r.expected) || stripHtml(r.extra)
    : stripHtml(r.answerReplacesQuestion ? r.extra : r.answer)
  return { card, note, deckName, question, answer, status: cardStatus(card) }
}

export type StatusFilter = CardStatus | 'flagged' | ''

export interface BrowserFilter {
  deckIds: readonly string[] | null
  q: string
  tag: string
  status: StatusFilter
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
    if (f.status === 'flagged' ? row.card.flag === 0 : f.status && row.status !== f.status) {
      return false
    }
    if (q && !fold(`${row.question} ${row.answer} ${row.note.tags.join(' ')}`).includes(q)) {
      return false
    }
    return true
  })
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
