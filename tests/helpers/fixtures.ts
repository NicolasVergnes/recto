import { makeCard, makeDeck } from '$lib/domain/defaults'
import type { Card, Deck, DeckSettings } from '$lib/domain/types'

export const paris = (iso: string) => new Date(iso).getTime()

type SettingsPatch = Partial<Omit<DeckSettings, 'fsrs' | 'leitner'>> & {
  fsrs?: Partial<DeckSettings['fsrs']>
  leitner?: Partial<DeckSettings['leitner']>
}

export function deck(
  id: string,
  scheduler: Deck['scheduler'] = 'fsrs',
  patch: SettingsPatch = {},
  createdAt = paris('2026-01-10T10:00:00Z'),
): Deck {
  const d = makeDeck({ name: id, scheduler }, id, createdAt)
  const { fsrs, leitner, ...rest } = patch
  d.settings = {
    ...d.settings,
    ...rest,
    fsrs: { ...d.settings.fsrs, ...fsrs },
    leitner: { ...d.settings.leitner, ...leitner },
  }
  return d
}

export function card(
  id: string,
  patch: Partial<Card> = {},
  noteId = `n-${id}`,
  deckId = 'd1',
): Card {
  return { ...makeCard({ id: noteId, deckId }, 0, id, paris('2026-01-10T10:00:00Z')), ...patch }
}
