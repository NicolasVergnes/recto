import { describe, expect, it } from 'vitest'
import { frenchSpacing, t } from '$lib/i18n/t'

describe('t()', () => {
  it('returns the French string for a key', () => {
    expect(t('review.showAnswer')).toBe('Afficher la réponse')
  })

  it('interpolates parameters and formats numbers in French', () => {
    expect(t('home.due', { n: 1234 })).toBe(
      `${new Intl.NumberFormat('fr-FR').format(1234)} à revoir`,
    )
    expect(t('scheduler.boxTarget', { n: 3, when: 'dans 7 j' })).toBe('→ C3 · dans 7 j')
  })

  it('keeps unknown placeholders untouched', () => {
    expect(t('home.due')).toBe('{n} à revoir')
  })

  it('applies French no-break spaces', () => {
    expect(t('storage.quotaWarning', { pct: 85 })).toContain('85\u00a0%')
    expect(frenchSpacing('Préfecture : Laon ?')).toBe('Préfecture\u00a0: Laon\u00a0?')
    expect(frenchSpacing('« bonjour »')).toBe('«\u00a0bonjour\u00a0»')
  })
})

describe('plurals', () => {
  it('uses the French singular for 0 and 1', () => {
    expect(t('home.cardCount', { n: 0 })).toBe('0 carte')
    expect(t('home.cardCount', { n: 1 })).toBe('1 carte')
    expect(t('home.cardCount', { n: 2 })).toBe('2 cartes')
    expect(t('home.cardCount')).toBe('{n} cartes')
  })
})
