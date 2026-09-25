import type { Deck } from './types'

/** Deck path as shown and as used by CSV/Anki (`Parent::Child`). */
export function deckPath(deck: Deck, byId: ReadonlyMap<string, Deck>): string {
  const parent = deck.parentId ? byId.get(deck.parentId) : undefined
  return parent ? `${parent.name}::${deck.name}` : deck.name
}

export interface DeckNode {
  deck: Deck
  children: Deck[]
}

const byName = (a: Deck, b: Deck) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })

/** Top-level decks sorted by name, each with its sorted sub-decks (one level, SPEC §5.1). */
export function deckTree(decks: readonly Deck[]): DeckNode[] {
  const ids = new Set(decks.map((d) => d.id))
  const roots = decks.filter((d) => !d.parentId || !ids.has(d.parentId)).sort(byName)
  return roots.map((deck) => ({
    deck,
    children: decks.filter((d) => d.parentId === deck.id).sort(byName),
  }))
}

export interface DeckOption {
  id: string
  label: string
  depth: 0 | 1
}

/** Flattened tree for `<select>`: parents followed by their children. */
export function deckOptions(decks: readonly Deck[]): DeckOption[] {
  const out: DeckOption[] = []
  for (const node of deckTree(decks)) {
    out.push({ id: node.deck.id, label: node.deck.name, depth: 0 })
    for (const child of node.children) {
      out.push({ id: child.id, label: `${node.deck.name} › ${child.name}`, depth: 1 })
    }
  }
  return out
}
