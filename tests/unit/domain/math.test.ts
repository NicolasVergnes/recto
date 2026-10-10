import { describe, expect, it } from 'vitest'
import { renderClozeAnswer, renderClozeQuestion } from '$lib/domain/cloze'
import { markMath, parseFormula, stripMathDelimiters } from '$lib/domain/math'
import { decodeEntities, escapeHtml } from '$lib/domain/text'

const span = (source: string) => `<span class="math">${source}</span>`

// The four spellings of a formula: MathJax's, and Anki's (M10).
const SYNTAXES = [
  { name: '\\( … \\)', open: '\\(', close: '\\)', display: false },
  { name: '\\[ … \\]', open: '\\[', close: '\\]', display: true },
  { name: '[$] … [/$]', open: '[$]', close: '[/$]', display: false },
  { name: '[$$] … [/$$]', open: '[$$]', close: '[/$$]', display: true },
]

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

  it('leaves Anki’s [latex] raw: LaTeX in text mode, which KaTeX does not render (05 §2.3)', () => {
    const latex = '[latex]\\LaTeX \\begin{tabular}{c}a\\end{tabular}[/latex]'
    expect(markMath(latex)).toBe(latex)
    expect(stripMathDelimiters(latex)).toBe(latex)
    // Around a formula, it stays text too.
    expect(markMath(`${latex} [$]x[/$]`)).toBe(`${latex} ${span('[$]x[/$]')}`)
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

  it('removes the delimiters of the Anki syntaxes too (M10)', () => {
    expect(stripMathDelimiters('[$]x^2[/$]')).toBe('x^2')
    expect(stripMathDelimiters('soit [$$]\\frac{1}{2}[/$$] ou [$]y[/$]')).toBe(
      'soit \\frac{1}{2} ou y',
    )
    expect(stripMathDelimiters('[$]x^2')).toBe('[$]x^2')
    expect(stripMathDelimiters('<img alt="[$]x[/$]">')).toBe('<img alt="[$]x[/$]">')
    // [latex] is not a formula.
    expect(stripMathDelimiters('[latex]x^2[/latex]')).toBe('[latex]x^2[/latex]')
  })
})

describe('Anki syntaxes [$] … [/$] and [$$] … [/$$] (M10)', () => {
  it('are inline and display formulas, delimiters kept as typed', () => {
    expect(markMath('Aire : [$]\\pi r^2[/$].')).toBe(`Aire : ${span('[$]\\pi r^2[/$]')}.`)
    expect(markMath('[$$]\\frac{1}{2}[/$$]')).toBe(span('[$$]\\frac{1}{2}[/$$]'))
    expect(markMath('[$$]\\begin{aligned}a &amp;= b \\\\<br>c &amp;= d\\end{aligned}[/$$]')).toBe(
      span('[$$]\\begin{aligned}a &amp;= b \\\\ c &amp;= d\\end{aligned}[/$$]'),
    )
  })

  it('tell [$$] from [$] and mix with the MathJax syntaxes', () => {
    expect(markMath('[$$]a[/$$] [$]b[/$] [$$]c[/$$]')).toBe(
      `${span('[$$]a[/$$]')} ${span('[$]b[/$]')} ${span('[$$]c[/$$]')}`,
    )
    expect(markMath('\\(a\\) [$]b[/$] \\[c\\] [$$]d[/$$]')).toBe(
      [span('\\(a\\)'), span('[$]b[/$]'), span('\\[c\\]'), span('[$$]d[/$$]')].join(' '),
    )
    // Each opener has its own closer.
    expect(markMath('[$$]a[/$]')).toBe('[$$]a[/$]')
    expect(markMath('[$]a[/$$]')).toBe('[$]a[/$$]')
    expect(markMath('[$$]a[/$] b[/$$]')).toBe(span('[$$]a[/$] b[/$$]'))
    expect(markMath('\\(a[/$]\\) et [$]b\\)[/$]')).toBe(
      `${span('\\(a[/$]\\)')} et ${span('[$]b\\)[/$]')}`,
    )
    // The first closer wins whatever the syntax: formulas never nest.
    expect(markMath('\\(a [$]b[/$] c\\)')).toBe(span('\\(a [$]b[/$] c\\)'))
    expect(markMath('[$]a \\(b\\) c[/$]')).toBe(span('[$]a \\(b\\) c[/$]'))
    // An unclosed opener hides no formula of another syntax.
    expect(markMath('[$] a [$$]b[/$$] \\(c\\) [$] d')).toBe(
      `[$] a ${span('[$$]b[/$$]')} ${span('\\(c\\)')} [$] d`,
    )
  })

  it('obey the backslash like the MathJax syntaxes', () => {
    // `\\` is an escaped backslash, then a real opener or closer.
    expect(markMath('C:\\\\[$]a[/$]')).toBe(`C:\\\\${span('[$]a[/$]')}`)
    expect(markMath('[$]a \\\\[/$]')).toBe(span('[$]a \\\\[/$]'))
    // `\[` is a pair, so `\[/$]` closes nothing.
    expect(markMath('[$]a \\[/$]')).toBe('[$]a \\[/$]')
    // `&#91;` shows `[` without opening a formula (04-UI).
    expect(markMath('&#91;$]x&#91;/$]')).toBe('&#91;$]x&#91;/$]')
  })
})

describe.each(SYNTAXES)('the formula $name', ({ open: O, close: C, display }) => {
  const f = (tex: string) => span(O + tex + C)

  it('is marked with its delimiters as typed, and stripped for typed answers', () => {
    expect(markMath(`Soit ${O}x^2${C}.`)).toBe(`Soit ${f('x^2')}.`)
    expect(markMath(`${O}a${C} et ${O}b${C}`)).toBe(`${f('a')} et ${f('b')}`)
    expect(markMath(`${O}${C}`)).toBe(f(''))
    expect(stripMathDelimiters(`Soit ${O}x^2${C}.`)).toBe('Soit x^2.')
    expect(parseFormula(`${O}x^2${C}`)).toEqual({ tex: 'x^2', display })
  })

  it('decodes entities and reads a bare `<` as text unless it starts a whole tag', () => {
    expect(markMath(`${O}a &lt; b${C}`)).toBe(f('a &lt; b'))
    expect(markMath(`${O}x&nbsp;=&nbsp;1${C}`)).toBe(f('x = 1'))
    expect(markMath(`${O}a<b${C} et ${O}b>c${C}`)).toBe(`${f('a&lt;b')} et ${f('b&gt;c')}`)
    expect(markMath(`${O}a<b c${C} et ${O}d>e${C}`)).toBe(`${f('a&lt;b c')} et ${f('d&gt;e')}`)
    expect(stripMathDelimiters(`${O}a<b${C} et ${O}b>c${C}`)).toBe('a&lt;b et b&gt;c')
  })

  it('drops tags, and reads line breaks as spaces', () => {
    expect(markMath(`${O}a<i>b</i>${C}`)).toBe(f('ab'))
    expect(markMath(`${O}<b>x</b>^2${C}`)).toBe(f('x^2'))
    expect(markMath(`${O}\\sum</div><div>n${C}`)).toBe(f('\\sum  n'))
    expect(markMath(`${O}\\alpha<br/>b${C}`)).toBe(f('\\alpha b'))
    expect(stripMathDelimiters(`${O}a &amp;= b<div>c</div>${C}`)).toBe('a &amp;= b c ')
  })

  it('ignores delimiters inside tags and attributes', () => {
    const img = `<img src="f.png" alt="${O}x${C}">`
    expect(markMath(img)).toBe(img)
    expect(markMath(`${img} ${O}y${C}`)).toBe(`${img} ${f('y')}`)
    expect(stripMathDelimiters(img)).toBe(img)
    // A closer in an attribute does not close a formula opened before the tag.
    expect(markMath(`${O}a <img alt="${C}"> b${C}`)).toBe(f('a  b'))
    // A quoted value may hold a `>`: the tag ends after the closing quote.
    const alt = `<img src="a.png" alt="a > ${O}x${C}"> suite`
    expect(markMath(alt)).toBe(alt)
    expect(markMath(`<img alt='a > ${O}x${C}'>`)).toBe(`<img alt='a > ${O}x${C}'>`)
    expect(markMath(`<img src=a.png alt=${O}x${C}> ${O}y${C}`)).toBe(
      `<img src=a.png alt=${O}x${C}> ${f('y')}`,
    )
  })

  it('stays raw when it is only opened, or only closed', () => {
    expect(markMath(`${O}x^2`)).toBe(`${O}x^2`)
    expect(markMath(`fin ${C}`)).toBe(`fin ${C}`)
    expect(markMath(`${O}a${C} ${O}b`)).toBe(`${f('a')} ${O}b`)
    expect(stripMathDelimiters(`${O}x^2`)).toBe(`${O}x^2`)
  })

  it('takes the first closer: formulas never nest', () => {
    expect(markMath(`${O}a ${O}b${C} c${C}`)).toBe(`${f(`a ${O}b`)} c${C}`)
  })

  it('stays linear with many unclosed openers (malformed import)', () => {
    const other = O === '\\(' ? '\\[y\\]' : '\\(y\\)'
    const raw = `${O.repeat(50_000)}${'x'.repeat(100_000)}`
    expect(markMath(`${raw}${other}`)).toBe(`${raw}${span(other)}`)
    expect(stripMathDelimiters(`${raw}${other}`)).toBe(`${raw}y`)
  })

  it('works around and inside clozes', () => {
    expect(markMath(renderClozeAnswer(`{{c1::${O}x^2${C}}}`, 1))).toBe(
      `<span class="cloze">${f('x^2')}</span>`,
    )
    expect(markMath(renderClozeQuestion(`{{c1::${O}x^2${C}::${O}y${C}}}`, 1))).toBe(
      `<span class="cloze">[${f('y')}]</span>`,
    )
    // Known limit (04-UI): a deletion inside a formula is not highlighted.
    expect(markMath(renderClozeQuestion(`${O}x = {{c1::2}}${C}`, 1))).toBe(f('x = […]'))
    expect(markMath(renderClozeAnswer(`${O}x = {{c1::2}}${C}`, 1))).toBe(f('x = 2'))
  })
})

describe('parseFormula (what markMath wrote, read back for KaTeX)', () => {
  it('gives the TeX between the delimiters, and the mode', () => {
    expect(parseFormula('\\(x^2\\)')).toEqual({ tex: 'x^2', display: false })
    expect(parseFormula('\\[\\frac{1}{2}\\]')).toEqual({ tex: '\\frac{1}{2}', display: true })
    expect(parseFormula('[$]x^2[/$]')).toEqual({ tex: 'x^2', display: false })
    expect(parseFormula('[$$]\\frac{1}{2}[/$$]')).toEqual({ tex: '\\frac{1}{2}', display: true })
    expect(parseFormula('[$][/$]')).toEqual({ tex: '', display: false })
    // The TeX may hold the delimiters of another syntax.
    expect(parseFormula('[$$]a \\) [/$] b[/$$]')).toEqual({ tex: 'a \\) [/$] b', display: true })
    expect(parseFormula('\\([$]x[/$]\\)')).toEqual({ tex: '[$]x[/$]', display: false })
  })

  it('refuses any other text', () => {
    for (const text of [
      '',
      'x^2',
      '\\(x^2',
      'x^2\\)',
      '\\(x^2\\]',
      '[$]x^2',
      '[$]x^2[/$$]',
      '[$$]x^2[/$]',
      '[$]',
      '[/$]',
      '\\(',
      '\\)',
      '[latex]x[/latex]',
    ]) {
      expect(parseFormula(text), text).toBeNull()
    }
  })
})

describe('markMath on hostile fields (ADR-009)', () => {
  const PAYLOADS = [
    '<img src=x onerror=alert(1)>',
    '</span><img src=x onerror=alert(1)><span class="math">',
    '<script>alert(1)</script>',
    '"><svg onload=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '&lt;/span&gt;&lt;img src=x onerror=alert(1)&gt;',
    '&#60;script&#62;alert(1)&#60;/script&#62;',
    '<<img src=x onerror=alert(1)>',
    '<img src=x onerror=alert(1)',
  ]

  describe.each(SYNTAXES)('with $name', ({ open: O, close: C }) => {
    it.each(PAYLOADS)('holds %s as escaped text in one span', (payload) => {
      const out = markMath(`${O}${payload}${C}`)
      // The whole field is the span, which holds no markup character at all.
      const match = /^<span class="math">([^<>"]*)<\/span>$/.exec(out)
      expect(match, out).not.toBeNull()
      const source = decodeEntities(match?.[1] ?? '')
      expect(source.startsWith(O) && source.endsWith(C)).toBe(true)
    })
  })

  // A seeded generator: the same fields at every run.
  const PIECES = [
    ...SYNTAXES.flatMap(({ open, close }) => [open, close]),
    ...['[latex]', '[/latex]', '\\\\', '\\', '$', '[', ']', '(', ')', '{{c1::', '}}'],
    ...['<b>', '</b>', '<br>', '<div>', '</div>', '<p>', '<img src="', '<img alt="', '">'],
    ...['"', "'", '=', '<', '>', '&lt;', '&gt;', '&amp;', '&#92;', '&#91;', '&nbsp;', '&'],
    ...['<img src=x onerror=alert(1)>', '</span>', '<script>', 'x', ' ', '\n'],
  ]
  const isSubsequence = (part: string, whole: string) => {
    let i = 0
    for (const c of whole) if (c === part[i]) i++
    return i === part.length
  }

  it('wraps formulas in text-only spans and touches nothing else, on random fields', () => {
    let seed = 2026
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
    const piece = () => PIECES[Math.floor(next() * PIECES.length)] ?? ''
    // A piece, or often a formula (any syntax) around a few pieces.
    const chunk = () => {
      const syntax = SYNTAXES[Math.floor(next() * SYNTAXES.length)]
      if (!syntax || next() >= 0.4) return piece()
      return (
        syntax.open + Array.from({ length: Math.floor(next() * 5) }, piece).join('') + syntax.close
      )
    }
    let formulas = 0
    for (let n = 0; n < 1000; n++) {
      const html = Array.from({ length: 1 + Math.floor(next() * 14) }, chunk).join('')
      const out = markMath(html)
      const opened = out.match(/<span class="math">/g)?.length ?? 0
      const closed = [...out.matchAll(/<span class="math">([^<>"]*)<\/span>/g)]
      // Every span written holds escaped text only.
      expect(closed.length, html).toBe(opened)
      formulas += opened
      // Outside the spans, the field as typed: no character is added.
      const rest = out.replace(/<span class="math">[^<>"]*<\/span>/g, '')
      expect(isSubsequence(rest, html), html).toBe(true)
      // markMath() and stripMathDelimiters() find the very same formulas.
      const unmarked = out.replace(/<span class="math">([^<>"]*)<\/span>/g, (_m, text: string) =>
        escapeHtml(parseFormula(decodeEntities(text))?.tex ?? '\u0000'),
      )
      expect(unmarked, html).toBe(stripMathDelimiters(html))
    }
    // The generator does produce formulas.
    expect(formulas).toBeGreaterThan(200)
  })
})
