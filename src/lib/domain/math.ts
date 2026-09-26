/**
 * LaTeX formulas in card fields (SPEC §5.2): `\( … \)` inline, `\[ … \]` display. Pure: this
 * module only finds formulas; `src/lib/math/katex.ts`, loaded on demand, renders them.
 * Anki's `[latex]…[/latex]`, `[$]…[/$]` and `[$$]…[/$$]` are left raw (05 §2).
 */
import { decodeEntities, escapeHtml } from './text'

// A whole tag with well-formed attributes, quoted or not: a `>` or a delimiter in a quoted value
// belongs to the tag. Any other `<` is text, so `\(a<b\)` is a formula, not a `<b` tag.
const TAG_RE =
  /<\/?[a-z][a-z0-9]*(?:\s+[a-z][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=`]+))?)*\s*\/?>/iy
// Tags that break the line, and therefore separate words (as in `stripHtml()`).
const BLOCK_TAG_RE = /^<\/?(?:br|div|p|li)\b/i

/** End of the token at `i`: a whole tag, a `\x` pair (so `\\(` opens nothing) or a character. */
function tokenEnd(html: string, i: number): number {
  if (html[i] === '\\') return i + 2
  TAG_RE.lastIndex = i
  return TAG_RE.test(html) ? TAG_RE.lastIndex : i + 1
}

/** A token of a formula as TeX: a tag disappears, or becomes a space if it breaks the line. */
function texOf(token: string): string {
  if (token[0] !== '<' || token.length === 1) return token
  return BLOCK_TAG_RE.test(token) ? ' ' : ''
}

/**
 * Replaces each formula by `replace(tex, display)`. A formula runs from `\(` or `\[` to the
 * first matching closer, token by token: formulas never nest, and a delimiter inside a tag
 * counts for nothing. `tex` is the text the field shows: tags dropped (line breaks become
 * spaces), entities decoded. An opener without closer stays raw, and so do the later openers
 * of its kind, which cannot be closed either: one pass, linear time.
 */
function replaceMath(html: string, replace: (tex: string, display: boolean) => string): string {
  let out = ''
  let copied = 0
  const unclosed = new Set<string>()
  for (let i = 0; i < html.length;) {
    const open = html.startsWith('\\(', i) ? '(' : html.startsWith('\\[', i) ? '[' : ''
    if (open && !unclosed.has(open)) {
      const close = open === '(' ? '\\)' : '\\]'
      let tex = ''
      let j = i + 2
      while (j < html.length && !html.startsWith(close, j)) {
        const end = tokenEnd(html, j)
        tex += texOf(html.slice(j, end))
        j = end
      }
      if (j < html.length) {
        out += html.slice(copied, i) + replace(decodeEntities(tex), open === '[')
        i = copied = j + close.length
        continue
      }
      unclosed.add(open)
    }
    i = tokenEnd(html, i)
  }
  return out + html.slice(copied)
}

/**
 * Wraps each formula in `<span class="math">` holding its escaped source, delimiters included,
 * before `sanitize()` (span and class are whitelisted): KaTeX receives plain TeX. Until KaTeX
 * renders the span, or if it cannot, the source stays visible as before.
 */
export function markMath(html: string): string {
  return replaceMath(html, (tex, display) => {
    const source = display ? `\\[${tex}\\]` : `\\(${tex}\\)`
    return `<span class="math">${escapeHtml(source)}</span>`
  })
}

/**
 * Field HTML with each formula replaced by its TeX without delimiters (`\(x^2\)` → `x^2`),
 * escaped so that `stripHtml()` gives it back as text, a `<` included. Works on HTML, before
 * `stripHtml()`, to find exactly the formulas `markMath()` finds.
 */
export function stripMathDelimiters(html: string): string {
  return replaceMath(html, (tex) => escapeHtml(tex))
}
