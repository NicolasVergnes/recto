// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markMath } from '$lib/domain/math'
import { renderMath } from '$lib/math/katex'
import { sanitize } from '$lib/sanitize'

/** The CardContent pipeline: mark, sanitise, insert, then render. */
function rendered(html: string): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = sanitize(markMath(html))
  renderMath(root, 'Formule LaTeX invalide')
  return root
}

// The four spellings of a formula: MathJax's, and Anki's (M10).
const SYNTAXES: [open: string, close: string][] = [
  ['\\(', '\\)'],
  ['\\[', '\\]'],
  ['[$]', '[/$]'],
  ['[$$]', '[/$$]'],
]

describe('formulas through sanitize()', () => {
  it('keeps the marked span and its escaped source', () => {
    expect(sanitize(markMath('<b>Aire</b> \\(a &lt; b\\)<script>x()</script>'))).toBe(
      '<b>Aire</b> <span class="math">\\(a &lt; b\\)</span>',
    )
    expect(sanitize(markMath('\\(<img src=x onerror=alert(1)>\\)'))).toBe(
      '<span class="math">\\(\\)</span>',
    )
  })

  it('keeps the span of an Anki formula, with its source as typed', () => {
    expect(sanitize(markMath('<b>Aire</b> [$]a &lt; b[/$]<script>x()</script>'))).toBe(
      '<b>Aire</b> <span class="math">[$]a &lt; b[/$]</span>',
    )
    expect(sanitize(markMath('[$$]<img src=x onerror=alert(1)>[/$$]'))).toBe(
      '<span class="math">[$$][/$$]</span>',
    )
  })

  it('leaves an attribute holding `>` and a delimiter intact', () => {
    const root = document.createElement('div')
    root.innerHTML = sanitize(markMath('<img src="a.png" alt="a > \\(x\\)"> suite'))
    expect(root.querySelector('img')?.alt).toBe('a > \\(x\\)')
    expect(root.querySelector('span.math')).toBeNull()
    expect(root.textContent).toBe(' suite')
  })
})

describe('renderMath (KaTeX, ADR-009)', () => {
  it('renders inline formulas with MathML for screen readers', () => {
    const root = rendered('Aire : \\(\\pi r^2\\)')
    const math = root.querySelector('span.math')
    expect(math?.querySelector('.katex .katex-mathml math')).not.toBeNull()
    expect(math?.querySelector('.katex-html')?.getAttribute('aria-hidden')).toBe('true')
    expect(math?.querySelector('annotation')?.textContent).toBe('\\pi r^2')
    expect(math?.querySelector('.katex-display')).toBeNull()
    expect(root.textContent).toContain('Aire :')
  })

  it('renders display formulas in display mode', () => {
    const root = rendered(
      '\\[\\frac{1}{2}\\]<br>\\[\\begin{aligned}a &amp;= b \\\\<br>c &amp;= d\\end{aligned}\\]',
    )
    const displays = root.querySelectorAll('.katex-display')
    expect(displays).toHaveLength(2)
    expect(displays[0]?.querySelector('math')?.getAttribute('display')).toBe('block')
    expect(displays[0]?.querySelector('.mfrac')).not.toBeNull()
    expect(root.querySelector('.math-error')).toBeNull()
  })

  it('renders Anki <div> lines and raw `<` typed in the editor', () => {
    const lines = rendered('\\[\\sum</div><div>n\\]')
    expect(lines.querySelector('.math-error')).toBeNull()
    expect(lines.querySelector('annotation')?.textContent).toBe('\\sum  n')
    const root = rendered('\\(a<b\\) et \\(b>c\\)')
    const annotations = [...root.querySelectorAll('annotation')].map((a) => a.textContent)
    expect(annotations).toEqual(['a<b', 'b>c'])
    expect(root.querySelector('.math-error')).toBeNull()
  })

  it('keeps the source of an invalid formula, with its message for all users', () => {
    const root = rendered('\\(\\frac{1\\) et \\(x^2\\)')
    const [bad, good] = root.querySelectorAll<HTMLElement>('span.math')
    expect(bad?.firstChild?.textContent).toBe('\\(\\frac{1\\)')
    expect(bad?.classList.contains('math-error')).toBe(true)
    expect(bad?.title).toBe('Formule LaTeX invalide')
    // No hover on a phone, `title` unreliable for screen readers: the message is also text.
    expect(bad?.querySelector('.visually-hidden')?.textContent).toBe(' (Formule LaTeX invalide)')
    expect(good?.querySelector('.katex')).not.toBeNull()
  })

  it('refuses links, includes and HTML commands, and caps sizes', () => {
    const root = rendered(
      '\\(\\href{javascript:alert(1)}{x} \\url{https://a.b} \\includegraphics{f.png} \\htmlClass{c}{y}\\)',
    )
    expect(root.querySelector('a, img, [class~="c"]')).toBeNull()
    const rule = rendered('\\(\\rule{1000em}{1em}\\)')
    const visual = rule.querySelector('.katex-html')?.innerHTML
    expect(visual).toContain('border-right-width:10em')
    expect(visual).not.toContain('1000em')
  })

  it('does not share macros between formulas', () => {
    const root = rendered('\\(\\gdef\\recto{42}\\recto\\) \\(\\recto\\)')
    const [first, second] = root.querySelectorAll<HTMLElement>('span.math')
    expect(first?.querySelector('annotation')).not.toBeNull()
    expect(second?.classList.contains('math-error')).toBe(true)
  })

  it('only touches spans produced by markMath()', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<span class="math">pas une formule</span><span class="math"><span class="math">\\(x\\)</span></span>'
    renderMath(root, 'invalide')
    const [plain, outer] = root.querySelectorAll<HTMLElement>(':scope > span.math')
    expect(plain?.innerHTML).toBe('pas une formule')
    expect(outer?.classList.contains('math-error')).toBe(false)
    expect(outer?.querySelector('span.math .katex')).not.toBeNull()
  })
})

describe('Anki formula syntaxes through KaTeX (M10)', () => {
  it('renders [$] as inline math and [$$] as display math', () => {
    const root = rendered('Aire : [$]\\pi r^2[/$] puis [$$]\\frac{1}{2}[/$$]')
    const [inline, display] = root.querySelectorAll<HTMLElement>('span.math')
    expect(inline?.querySelector('.katex .katex-mathml math')).not.toBeNull()
    expect(inline?.querySelector('.katex-display')).toBeNull()
    expect(inline?.querySelector('annotation')?.textContent).toBe('\\pi r^2')
    expect(display?.querySelector('.katex-display .mfrac')).not.toBeNull()
    expect(display?.querySelector('math')?.getAttribute('display')).toBe('block')
    expect(display?.querySelector('annotation')?.textContent).toBe('\\frac{1}{2}')
    expect(root.querySelector('.math-error')).toBeNull()
    expect(root.textContent).toContain('Aire :')
  })

  it('renders them as the MathJax syntaxes: same TeX, same mode', () => {
    const tex = '\\begin{aligned}a &amp;= b \\\\<br>c &amp;= d\\end{aligned}'
    const mathjax = rendered(`\\(x^2\\) puis \\[${tex}\\]`)
    const anki = rendered(`[$]x^2[/$] puis [$$]${tex}[/$$]`)
    expect(anki.innerHTML).toBe(mathjax.innerHTML)
  })

  it('keeps an invalid Anki formula as typed, with its message for all users', () => {
    const root = rendered('[$]\\frac{1[/$] et [$$]x^2[/$$]')
    const [bad, good] = root.querySelectorAll<HTMLElement>('span.math')
    expect(bad?.firstChild?.textContent).toBe('[$]\\frac{1[/$]')
    expect(bad?.classList.contains('math-error')).toBe(true)
    expect(bad?.title).toBe('Formule LaTeX invalide')
    expect(bad?.querySelector('.visually-hidden')?.textContent).toBe(' (Formule LaTeX invalide)')
    expect(good?.querySelector('.katex-display')).not.toBeNull()
  })

  it('renders neither [latex] (text-mode LaTeX) nor an escaped delimiter', () => {
    const root = rendered('[latex]x^2[/latex] &#91;$]y&#91;/$]')
    expect(root.querySelector('span.math, .katex')).toBeNull()
    expect(root.textContent).toBe('[latex]x^2[/latex] [$]y[/$]')
  })
})

describe.each(SYNTAXES)('hostile fields with %s … %s (ADR-009)', (open, close) => {
  // HTML in a formula is dropped or kept as text; TeX is KaTeX's, which refuses what trust forbids.
  const HTML = [
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
  const TEX = [
    '\\href{javascript:alert(1)}{x}',
    '\\url{https://a.b}',
    '\\includegraphics{f.png}',
    '\\htmlClass{c}{y}',
    '\\htmlId{i}{y}',
    '\\htmlStyle{color:red}{y}',
    '\\htmlData{k=v}{y}',
  ]
  const DANGEROUS = 'script, img, a, iframe, object, embed, link, style, [id], [href], [src]'

  it('leave one span holding text, which the formula alone can show', () => {
    for (const payload of HTML) {
      const root = document.createElement('div')
      root.innerHTML = sanitize(markMath(`${open}${payload}${close}`))
      const [only, ...others] = root.querySelectorAll('*')
      expect(others, payload).toHaveLength(0)
      expect(only?.tagName, payload).toBe('SPAN')
      expect(only?.getAttributeNames(), payload).toEqual(['class'])
      expect(only?.className, payload).toBe('math')
      expect(only?.childElementCount, payload).toBe(0)
      expect(only?.textContent?.startsWith(open) && only.textContent.endsWith(close)).toBe(true)
      renderMath(root, 'invalide')
      for (const el of root.querySelectorAll('*')) {
        expect(
          el.getAttributeNames().filter((n) => n.startsWith('on')),
          payload,
        ).toEqual([])
      }
      expect(root.querySelector(DANGEROUS), payload).toBeNull()
    }
  })

  it('refuse links, includes and HTML commands', () => {
    for (const payload of TEX) {
      const root = rendered(`${open}${payload}${close}`)
      expect(root.querySelector('span.math'), payload).not.toBeNull()
      expect(root.querySelector(DANGEROUS), payload).toBeNull()
      expect(root.querySelector('[class~="c"], [data-k]'), payload).toBeNull()
    }
  })
})
