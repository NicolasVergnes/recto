import { describe, expect, it } from 'vitest'
import { deckOptions, deckPath, deckTree } from '$lib/domain/decks'
import { makeDeck } from '$lib/domain/defaults'

const geo = makeDeck({ name: 'Géographie' }, 'g', 0)
const dep = makeDeck({ name: 'Départements', parentId: 'g' }, 'd', 0)
const cap = makeDeck({ name: 'capitales', parentId: 'g' }, 'c', 0)
const astro = makeDeck({ name: 'Astronomie' }, 'a', 0)
const orphan = makeDeck({ name: 'Orphelin', parentId: 'missing' }, 'o', 0)

describe('deck helpers', () => {
  it('builds paths', () => {
    const byId = new Map([geo, dep].map((d) => [d.id, d]))
    expect(deckPath(dep, byId)).toBe('Géographie::Départements')
    expect(deckPath(geo, byId)).toBe('Géographie')
  })

  it('sorts a one-level tree and treats orphans as roots', () => {
    const tree = deckTree([dep, geo, astro, cap, orphan])
    expect(tree.map((n) => n.deck.name)).toEqual(['Astronomie', 'Géographie', 'Orphelin'])
    expect(tree[1]?.children.map((d) => d.name)).toEqual(['capitales', 'Départements'])
  })

  it('flattens options for selects', () => {
    expect(deckOptions([dep, geo, astro])).toEqual([
      { id: 'a', label: 'Astronomie', depth: 0 },
      { id: 'g', label: 'Géographie', depth: 0 },
      { id: 'd', label: 'Géographie › Départements', depth: 1 },
    ])
  })
})
