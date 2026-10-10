import { describe, expect, it } from 'vitest'
import { canTypeAnswer, compareTyped, similarity, suggestRating } from '$lib/domain/typed'

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

  it('needs a text to type', () => {
    expect(canTypeAnswer('Paris')).toBe(true)
    expect(canTypeAnswer('\\(x^2\\)')).toBe(true)
    expect(canTypeAnswer('<img src="drapeau.svg">')).toBe(false)
    expect(canTypeAnswer(' <br> ')).toBe(false)
    expect(canTypeAnswer('')).toBe(false)
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

  it('expects the Anki formulas [$] and [$$] without their delimiters too (M10)', () => {
    expect(canTypeAnswer('[$]x^2[/$]')).toBe(true)
    expect(canTypeAnswer('[$$]\\frac{1}{2}[/$$]')).toBe(true)
    // An empty formula leaves nothing to type.
    expect(canTypeAnswer('[$][/$]')).toBe(false)
    expect(canTypeAnswer(' [$$] [/$$] <br>')).toBe(false)
    // [latex] is no formula: its text is expected as written.
    expect(canTypeAnswer('[latex]x[/latex]')).toBe(true)

    expect(compareTyped('[$]x^2[/$]', ' x^2 ')).toEqual([{ text: 'x^2', kind: 'same' }])
    expect(compareTyped('[$$]\\frac{1}{2}[/$$]', '\\frac{1}{2}')).toEqual([
      { text: '\\frac{1}{2}', kind: 'same' },
    ])
    expect(compareTyped('Soit [$]x^2[/$] et [$$]y[/$$]', 'soit x^2 et y')).toEqual([
      { text: 'Soit x^2 et y', kind: 'same' },
    ])
    const parts = compareTyped('<b>[$]a &lt; b[/$]</b>', 'a<b')
    expect(
      parts
        .filter((p) => p.kind !== 'wrong')
        .map((p) => p.text)
        .join(''),
    ).toBe('a < b')
    expect(compareTyped('[$]a<b[/$] et [$]b>c[/$]', 'a<b et b>c')).toEqual([
      { text: 'a<b et b>c', kind: 'same' },
    ])
    // On a tie, the expected answer is shown without delimiters.
    expect(compareTyped('[$]x^2[/$]', '')).toEqual([{ text: 'x^2', kind: 'missing' }])
  })

  it('compares the Anki syntaxes like the MathJax ones', () => {
    // Attempts at the answer (right, close, partial, empty): the same comparison either way.
    const pairs: [mathjax: string, anki: string, attempts: string[]][] = [
      ['\\(x^2\\)', '[$]x^2[/$]', ['', 'x', 'x^2', 'x2', 'X^2']],
      [
        '\\[\\frac{1}{2}\\]',
        '[$$]\\frac{1}{2}[/$$]',
        ['', '\\frac{1}{2}', '\\frac{1}{3}', 'frac12'],
      ],
      [
        'Soit \\(a\\) puis \\[b\\]',
        'Soit [$]a[/$] puis [$$]b[/$$]',
        ['', 'a', 'soit a puis b', 'soit a puis c'],
      ],
    ]
    for (const [mathjax, anki, attempts] of pairs) {
      for (const typed of attempts) {
        expect(compareTyped(anki, typed), `${anki} / ${typed}`).toEqual(
          compareTyped(mathjax, typed),
        )
      }
      expect(canTypeAnswer(anki)).toBe(canTypeAnswer(mathjax))
    }
  })

  it('also accepts an Anki formula typed as written, delimiters included', () => {
    // A regex deck: KaTeX cannot render `\d`, so the back shows the source `[$]\d+[/$]`.
    const shown = compareTyped('[$]\\d+[/$]', '[$]\\d+[/$]')
    expect(shown).toEqual([{ text: '[$]\\d+[/$]', kind: 'same' }])
    expect(suggestRating(shown, [1, 2, 3, 4])).toBe(3)
    expect(compareTyped('[$]\\d+[/$]', '\\d+')).toEqual([{ text: '\\d+', kind: 'same' }])
    expect(compareTyped('[$$]y[/$$]', '[$$]y[/$$]')).toEqual([{ text: '[$$]y[/$$]', kind: 'same' }])
    // [latex] is typed as written.
    expect(compareTyped('[latex]\\alpha[/latex]', '[latex]\\alpha[/latex]')).toEqual([
      { text: '[latex]\\alpha[/latex]', kind: 'same' },
    ])
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
