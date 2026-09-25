import { makeDeck } from '../domain/defaults'
import { splitDeckPath } from '../domain/decks'
import { normalizeText } from '../domain/text'
import type { Deck, SchedulerKind } from '../domain/types'

/**
 * Resolves `Parent::Child` paths to decks, creating the missing ones (one nesting level).
 * Sibling names are compared normalised, as the repository enforces (M1 decision).
 */
export class DeckResolver {
  private readonly byKey = new Map<string, Deck>()
  readonly created: Deck[] = []

  constructor(
    existing: readonly Deck[],
    private readonly now: number,
    private readonly newId: () => string,
    private readonly scheduler: SchedulerKind = 'fsrs',
  ) {
    for (const deck of existing) this.byKey.set(this.key(deck.parentId ?? null, deck.name), deck)
  }

  private key(parentId: string | null, name: string): string {
    return `${parentId ?? ''}\u0000${normalizeText(name)}`
  }

  private get(parentId: string | null, name: string): Deck {
    const key = this.key(parentId, name)
    let deck = this.byKey.get(key)
    if (!deck) {
      deck = makeDeck({ name, parentId, scheduler: this.scheduler }, this.newId(), this.now)
      this.byKey.set(key, deck)
      this.created.push(deck)
    }
    return deck
  }

  /** Returns the deck for a path; `null` for an empty path. */
  resolve(path: string): Deck | null {
    const { parent, name } = splitDeckPath(path)
    if (!name) return null
    const parentDeck = parent ? this.get(null, parent) : null
    return this.get(parentDeck?.id ?? null, name)
  }
}
