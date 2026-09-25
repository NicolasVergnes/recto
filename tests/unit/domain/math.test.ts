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

  it('reads a `<` as text unless it starts a whole tag (raw HTML editor)', () => {
    expect(markMath('\\(a<b\\) et \\(b>c\\)')).toBe(
      `${span('\\(a&lt;b\\)')} et ${span('\\(b&gt;c\\)')}`,
    )
    expect(markMath('Si \\(x<y\\) alors \\(f(x)>f(y)\\)')).toBe(
      `Si ${span('\\(x&lt;y\\)')} alors ${span('\\(f(x)&gt;f(y)\\)')}`,
    )
    expect(markMath('\\(0<x<1\\)')).toBe(span('\\(0&lt;x&lt;1\\)'))
    expect(markMath('\\(n<k\\) fin')).toBe(`${span('\\(n&lt;k\\)')} fin`)
    // `<b c\) et \(d>` has no well-formed attributes: it is not a tag.
    expect(markMath('\\(a<b c\\) et \\(d>e\\)')).toBe(
      `${span('\\(a&lt;b c\\)')} et ${span('\\(d&gt;e\\)')}`,
    )
    // A whole tag stays a tag, as in the field's HTML.
    expect(markMath('\\(a<i>b</i>\\)')).toBe(span('\\(ab\\)'))
  })

  it('accepts <br> and other tags inside a formula (Anki imports)', () => {
    expect(markMath('\\[\\begin{aligned}a &amp;= b \\\\<br>c &amp;= d\\end{aligned}\\]')).toBe(
      span('\\[\\begin{aligned}a &amp;= b \\\\ c &amp;= d\\end{aligned}\\]'),
    )
    expect(markMath('\\(<b>x</b>^2\\)')).toBe(span('\\(x^2\\)'))
    expect(markMath('\\(<span style="color: rgb(0, 0, 0);">x</span>\\)')).toBe(span('\\(x\\)'))
  })

  it('reads line breaks (<br>, <div>, <p>, <li>) inside a formula as spaces', () => {
    // Anki splits lines with `<div>`: a command and the next letter must not merge.
    expect(markMath('\\[\\sum</div><div>n\\]')).toBe(span('\\[\\sum  n\\]'))
    expect(markMath('\\[\\alpha<div>b</div>\\]')).toBe(span('\\[\\alpha b \\]'))
    expect(markMath('\\[\\alpha<p>b</p>\\]')).toBe(span('\\[\\alpha b \\]'))
    expect(markMath('\\[\\alpha<br/>b\\]')).toBe(span('\\[\\alpha b\\]'))
  })

  it('ignores delimiters inside tags and attributes', () => {
    const img = '<img src="f.png" alt="\\(x\\)">'
    expect(markMath(img)).toBe(img)
    expect(markMath(`${img} \\(y\\)`)).toBe(`${img} ${span('\\(y\\)')}`)
    // A `\)` in an attribute does not close a formula opened before the tag.
    expect(markMath('\\(a <img alt="\\)"> b\\)')).toBe(span('\\(a  b\\)'))
    // A quoted value may hold a `>`: the tag ends after the closing quote.
    const alt = '<img src="a.png" alt="a > \\(x\\)"> suite'
    expect(markMath(alt)).toBe(alt)
    expect(markMath("<img alt='a > \\(x\\)'>")).toBe("<img alt='a > \\(x\\)'>")
    expect(markMath('<img src=a.png alt=\\(x\\)> \\(y\\)')).toBe(
      `<img src=a.png alt=\\(x\\)> ${span('\\(y\\)')}`,
    )
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
    // `&#92;(` shows `\(` without opening a formula (04-UI).
    expect(markMath('&#92;(x&#92;)')).toBe('&#92;(x&#92;)')
    // An unclosed opener does not hide the formulas of the other kind that follow it.
    expect(markMath('\\( a \\[b\\] \\( c')).toBe(`\\( a ${span('\\[b\\]')} \\( c`)
  })

  it('stays linear with many unclosed openers (malformed import)', () => {
    const raw = `${'\\('.repeat(50_000)}${'x'.repeat(100_000)}`
    expect(markMath(`${raw}\\[y\\]`)).toBe(`${raw}${span('\\[y\\]')}`)
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
    // Known limit (04-UI): inside a formula, a deletion is not highlighted and its hint is
    // read as TeX. A cloze around the whole formula has neither problem.
    const inside = '\\(x = {{c1::2}}\\)'
    expect(markMath(renderClozeQuestion(inside, 1))).toBe(span('\\(x = […]\\)'))
    expect(markMath(renderClozeAnswer(inside, 1))).toBe(span('\\(x = 2\\)'))
    expect(markMath(renderClozeQuestion('\\(x = {{c1::2::un entier}}\\)', 1))).toBe(
      span('\\(x = [un entier]\\)'),
    )
  })
})

describe('stripMathDelimiters (typed answers)', () => {
  it('removes the delimiters of the formulas only', () => {
    expect(stripMathDelimiters('\\(x^2\\)')).toBe('x^2')
    expect(stripMathDelimiters('soit \\[\\frac{1}{2}\\] ou \\(y\\)')).toBe('soit \\frac{1}{2} ou y')
    expect(stripMathDelimiters('\\(x^2')).toBe('\\(x^2')
    expect(stripMathDelimiters('C:\\\\(a\\\\)')).toBe('C:\\\\(a\\\\)')
    expect(stripMathDelimiters('<img alt="\\(x\\)">')).toBe('<img alt="\\(x\\)">')
    expect(stripMathDelimiters('<img alt="a > \\(x\\)">')).toBe('<img alt="a > \\(x\\)">')
  })

  it('escapes the formula text, so that stripHtml() gives it back whole', () => {
    expect(stripMathDelimiters('\\(a<b\\) et \\(b>c\\)')).toBe('a&lt;b et b&gt;c')
    expect(stripMathDelimiters('\\(a &amp;= b<div>c</div>\\)')).toBe('a &amp;= b c ')
  })
})
