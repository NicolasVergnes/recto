import { describe, expect, it } from 'vitest'
import { compareTyped, similarity, suggestRating } from '$lib/domain/typed'

describe('typed answers (SPEC §5.3)', () => {
  it('marks an exact answer (case and spaces ignored)', () => {
    const parts = compareTyped('<b>Paris</b>', '  paris ')
    expect(parts).toEqual([{ text: 'Paris', kind: 'same' }])
    expect(suggestRating(parts, [1, 2, 3, 4])).toBe(3)
    expect(similarity(parts)).toBe(1)
  })

  it('shows wrong and missing characters', () => {
    const parts = compareTyped('Bordeaux', 'Bordo')
    const join = (kinds: string[]) =>
      parts
        .filter((p) => kinds.includes(p.kind))
        .map((p) => p.text)
        .join('')
    expect(join(['same'])).toBe('Bord')
    expect(join(['same', 'missing'])).toBe('Bordeaux')
    expect(join(['wrong'])).toBe('o')
    expect(parts[0]).toEqual({ text: 'Bord', kind: 'same' })
  })

  it('suggests Hard when close and Again when far', () => {
    const close = compareTyped('Strasbourg', 'Strasburg')
    expect(similarity(close)).toBeGreaterThanOrEqual(0.8)
    expect(suggestRating(close, [1, 2, 3, 4])).toBe(2)
    expect(suggestRating(close, [1, 3])).toBe(1)
    expect(suggestRating(compareTyped('Lyon', 'Marseille'), [1, 2, 3, 4])).toBe(1)
    expect(suggestRating(compareTyped('Lyon', ''), [1, 3, 4])).toBe(1)
    expect(similarity(compareTyped('', ''))).toBe(1)
  })

  it('expects formulas without their delimiters', () => {
    expect(compareTyped('\\(x^2\\)', ' x^2 ')).toEqual([{ text: 'x^2', kind: 'same' }])
    expect(compareTyped('\\[\\frac{1}{2}\\]', '\\frac{1}{2}')).toEqual([
      { text: '\\frac{1}{2}', kind: 'same' },
    ])
    const parts = compareTyped('<b>\\(a &lt; b\\)</b>', 'a<b')
    expect(
      parts
        .filter((p) => p.kind !== 'wrong')
        .map((p) => p.text)
        .join(''),
    ).toBe('a < b')
    // A raw `<` inside a formula is text, not the start of a tag.
    expect(compareTyped('\\(a<b\\) et \\(b>c\\)', 'a<b et b>c')).toEqual([
      { text: 'a<b et b>c', kind: 'same' },
    ])
    // On a tie, the expected answer is shown without delimiters.
    expect(compareTyped('\\(x^2\\)', '')).toEqual([{ text: 'x^2', kind: 'missing' }])
  })

  it('also accepts a formula typed as written, delimiters included', () => {
    // A regex deck: KaTeX cannot render `\d`, so the back shows the source `\(\d+\)`.
    const shown = compareTyped('\\(\\d+\\)', '\\(\\d+\\)')
    expect(shown).toEqual([{ text: '\\(\\d+\\)', kind: 'same' }])
    expect(suggestRating(shown, [1, 2, 3, 4])).toBe(3)
    expect(compareTyped('\\(\\d+\\)', '\\d+')).toEqual([{ text: '\\d+', kind: 'same' }])
    expect(compareTyped('Soit \\(x^2\\)', 'soit \\(x^2\\)')).toEqual([
      { text: 'Soit \\(x^2\\)', kind: 'same' },
    ])
  })
})
