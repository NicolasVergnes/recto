import type { Card } from '$lib/domain/types'
import { cardOrds } from '$lib/domain/notes'
import type { RectoDB } from '$lib/db/schema'

/**
 * Invariants 1 and 2 of 02-DATA-MODEL §3 over a whole database: every card has the deck of its
 * note, and every note has exactly one card for each ord its content generates, none for another
 * ord and none twice. Returns the problems found (empty: the cards are consistent), so that a
 * failing test names the notes at fault.
 */
export async function cardProblems(db: RectoDB): Promise<string[]> {
  const [notes, cards, types] = await Promise.all([
    db.notes.toArray(),
    db.cards.toArray(),
    db.noteTypes.toArray(),
  ])
  const typeById = new Map(types.map((t) => [t.id, t]))
  const cardsOf = new Map<string, Card[]>()
  for (const card of cards) cardsOf.set(card.noteId, [...(cardsOf.get(card.noteId) ?? []), card])
  const problems: string[] = []
  const noteIds = new Set(notes.map((n) => n.id))
  for (const note of notes) {
    const type = note.noteTypeId ? typeById.get(note.noteTypeId) : undefined
    const wanted = cardOrds(note, type)
      .sort((a, b) => a - b)
      .join()
    const own = cardsOf.get(note.id) ?? []
    const have = own.map((c) => c.ord).sort((a, b) => a - b)
    if (have.join() !== wanted)
      problems.push(`note ${note.id}: cards [${have}], wanted [${wanted}]`)
    for (const card of own)
      if (card.deckId !== note.deckId) problems.push(`card ${card.id}: deck ${card.deckId}`)
  }
  for (const card of cards) if (!noteIds.has(card.noteId)) problems.push(`card ${card.id}: no note`)
  return problems
}
