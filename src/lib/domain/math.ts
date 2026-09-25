/**
 * LaTeX formulas in card fields (SPEC §5.2): `\( … \)` inline, `\[ … \]` display. Pure: this
 * module only finds formulas; `src/lib/math/katex.ts`, loaded on demand, renders them.
 * Anki's `[latex]…[/latex]`, `[$]…[/$]` and `[$$]…[/$$]` are left raw (05 §2).
 */
import { decodeEntities, escapeHtml } from './text'

const TAG = String.raw`<\/?[a-z][^>]*>`
// A formula body: whole tags (Anki puts `<br>` in display math), `\x` pairs (so `\\)` does not
// close, as in TeX), a `<` that opens no tag (`a < b`), any other character; the shortest wins.
const BODY = String.raw`((?:${TAG}|\\[\s\S]|<(?!\/?[a-z])|[^\\<])*?)`
// Outside formulas: whole tags (delimiters inside attributes are ignored) and `\\` (an escaped
// backslash: `\\(` opens nothing). Unclosed delimiters never match and stay raw.
const MATH_RE = new RegExp(String.raw`${TAG}|\\\\|\\\(${BODY}\\\)|\\\[${BODY}\\\]`, 'gi')

/**
 * Wraps each formula in `<span class="math">` holding its escaped source, delimiters included,
 * before `sanitize()` (span and class are whitelisted). Tags inside a formula are dropped
 * (`<br>` becomes a space) and entities decoded: KaTeX receives plain TeX. Until KaTeX renders
 * the span, or if it cannot, the source stays visible as before.
 */
export function markMath(html: string): string {
  return html.replace(MATH_RE, (match, inline?: string, display?: string) => {
    const body = inline ?? display
    if (body === undefined) return match
    const tex = decodeEntities(body.replace(/<br\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, ''))
    const source = inline === undefined ? `\\[${tex}\\]` : `\\(${tex}\\)`
    return `<span class="math">${escapeHtml(source)}</span>`
  })
}

/**
 * Field HTML with formulas stripped of their delimiters, for typed answers (`\(x^2\)` → `x^2`).
 * Works on HTML, before `stripHtml()`, to find exactly the formulas `markMath()` finds.
 */
export function stripMathDelimiters(html: string): string {
  return html.replace(
    MATH_RE,
    (match, inline?: string, display?: string) => inline ?? display ?? match,
  )
}
