import { renderCard } from '$lib/domain/notes'
import type { ApkgExportInput, ApkgExportReport } from '$lib/export/apkg'

/** What Recto expects Anki to find in an exported package (`check_apkg.py --expect`). */
export interface Expectations {
  notes: number
  cards: number
  revlog: number
  /** Cards per template (`ord`), keys as strings like in JSON. */
  cards_by_ord: Record<string, number>
  /** Custom notes: first field, template and the sides Recto renders for that card. */
  questions: { front: string; ord: number; question: string; answer: string }[]
}

/**
 * Question or answer HTML as `check_apkg.py` compares it: without the `[[type:Field]]` placeholder
 * Anki renders for a typed answer (Recto renders nothing), whitespace collapsed.
 */
export function normalized(html: string): string {
  return html
    .replace(/\[\[type:[^\]]*\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Counts of an export and, for custom notes, the sides Recto renders (the others are counted). */
export function expectations(input: ApkgExportInput, report: ApkgExportReport): Expectations {
  const notes = new Map(input.notes.map((n) => [n.id, n]))
  const types = new Map((input.noteTypes ?? []).map((t) => [t.id, t]))
  const byOrd: Record<string, number> = {}
  const questions: Expectations['questions'] = []
  for (const card of input.cards) {
    const note = notes.get(card.noteId)
    if (!note) continue
    byOrd[card.ord] = (byOrd[card.ord] ?? 0) + 1
    if (note.modelType !== 'custom') continue
    const type = note.noteTypeId ? types.get(note.noteTypeId) : undefined
    const side = renderCard(note, card, false, type)
    questions.push({
      front: note.fields[0] ?? '',
      ord: card.ord,
      question: normalized(side.question),
      answer: normalized(side.answer),
    })
  }
  return {
    notes: report.notes,
    cards: report.cards,
    revlog: report.reviews,
    cards_by_ord: byOrd,
    questions,
  }
}
