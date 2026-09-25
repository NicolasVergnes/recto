import { describe, expect, it } from 'vitest'
import { renderClozeAnswer, renderClozeQuestion } from '$lib/domain/cloze'
import { markMath, stripMathDelimiters } from '$lib/domain/math'

const span = (source: string) => `<span class="math">${source}</span>`

describe('markMath (SPEC §5.2)', () => {
  it('marks inline and display formulas, delimiters kept', () => {
    expect(markMath('Aire : \\(\\pi r^2\\).')).toBe(`Aire : ${span('\\(\\pi r^2\\)')}.`)
    expect(markMath('\\[\\frac{1}{2}\\]')).toBe(span('\\[\\frac{1}{2}\\]'))
    expect(markMath('\\(a\\) et \\[b\\] puis \\(c\\)')).toBe(
      `${span('\\(a\\)')} et ${span('\\[b\\]')} puis ${span('\\(c\\)')}`,
    )
    expect(markMath('\\(\\)')).toBe(span('\\(\\)'))
  })

  it('leaves text without formulas untouched', () => {
    const html = '<b>Paris</b> (75) [capitale] \\ fin'
    expect(markMath(html)).toBe(html)
    expect(markMath('')).toBe('')
  })

  it('decodes entities and escapes the source again', () => {
    expect(markMath('\\(a &lt; b\\)')).toBe(span('\\(a &lt; b\\)'))
    expect(markMath('\\[a &amp;= b\\]')).toBe(span('\\[a &amp;= b\\]'))
    expect(markMath('\\(x&nbsp;=&nbsp;1\\)')).toBe(span('\\(x = 1\\)'))
    // A raw `<` that opens no tag is text, as for the HTML parser.
    expect(markMath('\\(a < b\\) et \\(c > d\\)')).toBe(
      `${span('\\(a &lt; b\\)')} et ${span('\\(c &gt; d\\)')}`,
    )
  })

  it('accepts <br> and other tags inside a formula (Anki imports)', () => {
    expect(markMath('\\[\\begin{aligned}a &amp;= b \\\\<br>c &amp;= d\\end{aligned}\\]')).toBe(
      span('\\[\\begin{aligned}a &amp;= b \\\\ c &amp;= d\\end{aligned}\\]'),
    )
    expect(markMath('\\(<b>x</b>^2\\)')).toBe(span('\\(x^2\\)'))
  })

  it('ignores delimiters inside tags and attributes', () => {
    const img = '<img src="f.png" alt="\\(x\\)">'
    expect(markMath(img)).toBe(img)
    expect(markMath(`${img} \\(y\\)`)).toBe(`${img} ${span('\\(y\\)')}`)
    // A `\)` in an attribute does not close a formula opened before the tag.
    expect(markMath('\\(a <img alt="\\)"> b\\)')).toBe(span('\\(a  b\\)'))
  })

  it('leaves unclosed or escaped delimiters raw', () => {
    expect(markMath('\\(x^2')).toBe('\\(x^2')
    expect(markMath('\\[x\\)')).toBe('\\[x\\)')
    expect(markMath('fin \\)')).toBe('fin \\)')
    // `\\` is an escaped backslash: `\\(` opens nothing, `\\)` closes nothing.
    expect(markMath('C:\\\\(dossier\\\\)')).toBe('C:\\\\(dossier\\\\)')
    expect(markMath('\\(a \\\\) b\\)')).toBe(span('\\(a \\\\) b\\)'))
    expect(markMath('\\\\\\(x\\)')).toBe(`\\\\${span('\\(x\\)')}`)
    // `\\[2pt]` is a line break with spacing, not a display delimiter.
    expect(markMath('\\[a \\\\[2pt] b\\]')).toBe(span('\\[a \\\\[2pt] b\\]'))
  })

  it('takes the first closing delimiter: formulas never nest', () => {
    expect(markMath('\\(a \\(b\\) c\\)')).toBe(`${span('\\(a \\(b\\)')} c\\)`)
    expect(markMath('\\[a \\(b\\) c\\]')).toBe(span('\\[a \\(b\\) c\\]'))
  })

  it('leaves the Anki [latex], [$] and [$$] syntaxes raw', () => {
    const anki = '[latex]\\LaTeX[/latex] [$]x[/$] [$$]y[/$$]'
    expect(markMath(anki)).toBe(anki)
  })

  it('works with clozes around and inside formulas', () => {
    const around = '{{c1::\\(x^2\\)::\\(y\\)}}'
    expect(markMath(renderClozeAnswer(around, 1))).toBe(
      `<span class="cloze">${span('\\(x^2\\)')}</span>`,
    )
    expect(markMath(renderClozeQuestion(around, 1))).toBe(
      `<span class="cloze">[${span('\\(y\\)')}]</span>`,
    )
    // `}}` ends a deletion, as in Anki: a formula inside one writes `} }`.
    expect(markMath(renderClozeAnswer('{{c1::\\(\\frac{1}{x^{2} }\\)}}', 1))).toBe(
      `<span class="cloze">${span('\\(\\frac{1}{x^{2} }\\)')}</span>`,
    )
    const inside = '\\(x = {{c1::2}}\\)'
    expect(markMath(renderClozeQuestion(inside, 1))).toBe(span('\\(x = […]\\)'))
    expect(markMath(renderClozeAnswer(inside, 1))).toBe(span('\\(x = 2\\)'))
  })
})

describe('stripMathDelimiters (typed answers)', () => {
  it('removes the delimiters of the formulas only', () => {
    expect(stripMathDelimiters('\\(x^2\\)')).toBe('x^2')
    expect(stripMathDelimiters('soit \\[\\frac{1}{2}\\] ou \\(y\\)')).toBe('soit \\frac{1}{2} ou y')
    expect(stripMathDelimiters('\\(x^2')).toBe('\\(x^2')
    expect(stripMathDelimiters('C:\\\\(a\\\\)')).toBe('C:\\\\(a\\\\)')
    expect(stripMathDelimiters('<img alt="\\(x\\)">')).toBe('<img alt="\\(x\\)">')
  })
})
