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

describe('formulas through sanitize()', () => {
  it('keeps the marked span and its escaped source', () => {
    expect(sanitize(markMath('<b>Aire</b> \\(a &lt; b\\)<script>x()</script>'))).toBe(
      '<b>Aire</b> <span class="math">\\(a &lt; b\\)</span>',
    )
    expect(sanitize(markMath('\\(<img src=x onerror=alert(1)>\\)'))).toBe(
      '<span class="math">\\(\\)</span>',
    )
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

  it('keeps the source of an invalid formula, marked and titled', () => {
    const root = rendered('\\(\\frac{1\\) et \\(x^2\\)')
    const [bad, good] = root.querySelectorAll<HTMLElement>('span.math')
    expect(bad?.textContent).toBe('\\(\\frac{1\\)')
    expect(bad?.classList.contains('math-error')).toBe(true)
    expect(bad?.title).toBe('Formule LaTeX invalide')
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
