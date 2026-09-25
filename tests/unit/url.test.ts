import { describe, expect, it } from 'vitest'
import { href, matchPath, parseHash } from '$lib/url'

describe('hash routing helpers', () => {
  it('parses path and query', () => {
    expect(parseHash('')).toEqual({ path: '/', query: {} })
    expect(parseHash('#/cards?deck=a&q=b%20c')).toEqual({
      path: '/cards',
      query: { deck: 'a', q: 'b c' },
    })
    expect(parseHash('#stats')).toEqual({ path: '/stats', query: {} })
  })

  it('builds hrefs without empty values', () => {
    expect(href('/review', { deck: 'x', q: '', tag: undefined })).toBe('#/review?deck=x')
    expect(href('/')).toBe('#/')
  })

  it('matches patterns with params', () => {
    expect(matchPath('/decks/:id', '/decks/a%20b')).toEqual({ id: 'a b' })
    expect(matchPath('/decks/:id', '/decks/')).toBeNull()
    expect(matchPath('/notes/new', '/notes/new')).toEqual({})
    expect(matchPath('/notes/new', '/notes/42')).toBeNull()
    expect(matchPath('/', '/cards')).toBeNull()
  })
})
