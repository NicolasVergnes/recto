/**
 * KaTeX rendering of the formulas marked by `markMath()` (ADR-009). Loaded only through
 * `import()` by CardContent: never import it statically nor re-export it from a barrel, or
 * KaTeX (~77 KB gzip, plus its fonts) joins the initial bundle.
 */
import { renderToString } from 'katex'
import 'katex/dist/katex.min.css'

const FORMULA_RE = /^\\\(([\s\S]*)\\\)$|^\\\[([\s\S]*)\\\]$/

/**
 * Replaces the source of each `span.math` under `root` by KaTeX output: visual HTML plus
 * MathML for screen readers. This output does not go through `sanitize()`, which would strip
 * its styles, SVG and MathML: it is safe by construction (text escaped by KaTeX, `trust: false`
 * refuses `\href`, `\url`, `\includegraphics` and `\html…`, sizes capped, macros never shared
 * between formulas). An invalid formula keeps its source, marked `math-error` with a `title`.
 * `render()` is not used: it empties the element before parsing and throws in quirks mode.
 */
export function renderMath(root: ParentNode, invalidTitle: string): void {
  for (const el of root.querySelectorAll<HTMLElement>('span.math')) {
    // Only spans produced by markMath(): text alone, delimiters on both ends.
    const m = el.childElementCount === 0 ? FORMULA_RE.exec(el.textContent) : null
    if (!m) continue
    try {
      el.innerHTML = renderToString(m[1] ?? m[2] ?? '', {
        displayMode: m[2] !== undefined,
        output: 'htmlAndMathml',
        throwOnError: true,
        strict: 'ignore',
        trust: false,
        maxSize: 10,
      })
    } catch {
      el.classList.add('math-error')
      el.title = invalidTitle
    }
  }
}
