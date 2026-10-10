/**
 * Formulas in card fields (SPEC §5.2): MathJax's `\( … \)` (inline) and `\[ … \]` (display), and
 * Anki's `[$] … [/$]` (inline) and `[$$] … [/$$]` (display), which mean the same (M10). The four
 * follow the same rules, see `replaceMath()`. Pure: this module only finds formulas;
 * `src/lib/math/katex.ts`, loaded on demand, renders them. The fields are never rewritten: a
 * formula keeps the delimiters its author typed, Anki export included. Anki's
 * `[latex]…[/latex]` stays raw (05 §2.3): it is LaTeX in text mode, compiled to an image by
 * Anki, while KaTeX only renders formulas.
 */
import { decodeEntities, escapeHtml } from './text'

interface Delimiters {
  open: string
  close: string
  display: boolean
}

// `[$$]` comes before `[$]`, though the order does not matter: no opener begins another, nor does
// any closer (`[$$]` does not begin with `[$]`), so a text reads in one way only.
const DELIMITERS: readonly Delimiters[] = [
  { open: '\\(', close: '\\)', display: false },
  { open: '\\[', close: '\\]', display: true },
  { open: '[$$]', close: '[/$$]', display: true },
  { open: '[$]', close: '[/$]', display: false },
]

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
 * Replaces each formula by `replace(tex, delimiters)`. A formula runs from an opener to the
 * first matching closer, token by token: formulas never nest, a delimiter inside a tag counts
 * for nothing, and a backslash and the character after it make one token (so `\\(` opens
 * nothing, and `\[/$]` closes nothing). `tex` is the text the field shows: tags dropped (line
 * breaks become spaces), entities decoded. An opener without closer stays raw, and so do the
 * later openers of its kind, which cannot be closed either: one pass, linear time.
 */
function replaceMath(
  html: string,
  replace: (tex: string, delimiters: Delimiters) => string,
): string {
  let out = ''
  let copied = 0
  const unclosed = new Set<Delimiters>()
  for (let i = 0; i < html.length;) {
    const d = DELIMITERS.find(({ open }) => html.startsWith(open, i))
    if (d && !unclosed.has(d)) {
      let tex = ''
      let j = i + d.open.length
      while (j < html.length && !html.startsWith(d.close, j)) {
        const end = tokenEnd(html, j)
        tex += texOf(html.slice(j, end))
        j = end
      }
      if (j < html.length) {
        out += html.slice(copied, i) + replace(decodeEntities(tex), d)
        i = copied = j + d.close.length
        continue
      }
      unclosed.add(d)
    }
    i = tokenEnd(html, i)
  }
  return out + html.slice(copied)
}

/**
 * Wraps each formula in `<span class="math">` holding its escaped source, delimiters included
 * as typed, before `sanitize()` (span and class are whitelisted): KaTeX receives plain TeX.
 * Until KaTeX renders the span, or if it cannot, the source stays visible as the author wrote
 * it, which is also what a typed answer may repeat (`compareTyped()`). The span holds nothing
 * but this escaped text: no delimiter, whatever its syntax, can inject markup (ADR-009).
 */
export function markMath(html: string): string {
  return replaceMath(
    html,
    (tex, { open, close }) => `<span class="math">${escapeHtml(open + tex + close)}</span>`,
  )
}

/**
 * Field HTML with each formula replaced by its TeX without delimiters (`\(x^2\)` and `[$]x^2[/$]`
 * → `x^2`), escaped so that `stripHtml()` gives it back as text, a `<` included. Works on HTML,
 * before `stripHtml()`, to find exactly the formulas `markMath()` finds.
 */
export function stripMathDelimiters(html: string): string {
  return replaceMath(html, (tex) => escapeHtml(tex))
}

/**
 * The TeX and the mode of a formula written with its delimiters, as `markMath()` wrote it into
 * a span (its decoded text); null for any other text. The reverse of `markMath()`, for KaTeX.
 */
export function parseFormula(source: string): { tex: string; display: boolean } | null {
  const d = DELIMITERS.find(
    ({ open, close }) =>
      source.length >= open.length + close.length &&
      source.startsWith(open) &&
      source.endsWith(close),
  )
  return d
    ? { tex: source.slice(d.open.length, source.length - d.close.length), display: d.display }
    : null
}
