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

/** Number of notes and cards of a deck. */
export interface DeckCount {
  notes: number
  cards: number
}

/**
 * Counts of each deck with its sub-decks added (home screen, M13), like the daily queue counts.
 * `own` holds each deck's own notes and cards (`repo.deckCounts`).
 */
export function familyCounts(
  decks: readonly Deck[],
  own: ReadonlyMap<string, DeckCount>,
): Map<string, DeckCount> {
  const out = new Map<string, DeckCount>()
  for (const node of deckTree(decks)) {
    const total = { ...(own.get(node.deck.id) ?? { notes: 0, cards: 0 }) }
    for (const child of node.children) {
      const c = own.get(child.id) ?? { notes: 0, cards: 0 }
      out.set(child.id, { ...c })
      total.notes += c.notes
      total.cards += c.cards
    }
    out.set(node.deck.id, total)
  }
  return out
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

/**
 * `Parent::Child` paths (CSV `deck` column, Anki). One nesting level (SPEC §5.1): deeper levels
 * are flattened into the parent name, `A::B::C` → parent « A › B », child « C » (05 §2.3).
 */
export function splitDeckPath(path: string): { parent: string | null; name: string } {
  const parts = path
    .split('::')
    .map((p) => p.trim())
    .filter(Boolean)
  const name = parts.pop() ?? ''
  return { parent: parts.length > 0 ? parts.join(' › ') : null, name }
}
