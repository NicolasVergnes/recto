/** Pure text helpers for card fields (restricted HTML). No DOM. */

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

/** Plain text of a field: tags removed (block tags become spaces), entities decoded. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/\[sound:[^\]]*\]/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|li)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Duplicate key (05 §1): NFC, lowercase, whitespace collapsed, HTML removed. */
export function normalizeText(html: string): string {
  return stripHtml(html).normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim()
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Tags are free words separated by spaces (SPEC §5.2); duplicates removed, order kept. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of input.split(/\s+/)) {
    const tag = raw.trim()
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
  }
  return tags
}

export type AtomicityWarning = 'tooLong' | 'looksLikeList'

export const MAX_FIELD_CHARS = 200
export const MAX_LIST_ITEMS = 4

/** P8 (Wozniak 1999): warn, never block, when a field is long or looks like a list. */
export function atomicityWarnings(html: string): AtomicityWarning[] {
  const warnings: AtomicityWarning[] = []
  const text = stripHtml(html)
  if (text.length > MAX_FIELD_CHARS) warnings.push('tooLong')
  const bullets = (html.match(/<li\b/gi) ?? []).length
  const lineBullets = html
    .split(/<br\s*\/?>|\n/i)
    .filter((line) => /^([-*•–]|\d+[.)])\s/.test(stripHtml(line))).length
  // "27,3 jours" is a decimal: only count commas followed by a space.
  const commas = (text.match(/,\s/g) ?? []).length
  if (bullets > MAX_LIST_ITEMS || lineBullets > MAX_LIST_ITEMS || commas > MAX_LIST_ITEMS) {
    warnings.push('looksLikeList')
  }
  return warnings
}

export interface MediaRefs {
  images: string[]
  sounds: string[]
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const SOUND_RE = /\[sound:([^\]]+)\]/g

/** Local media names referenced by a field (`<img src>` and `[sound:]`); URLs are ignored. */
export function mediaRefs(html: string): MediaRefs {
  const images: string[] = []
  for (const m of html.matchAll(IMG_SRC_RE)) {
    const src = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (src && !isRemoteUrl(src) && !images.includes(src)) images.push(src)
  }
  const sounds: string[] = []
  for (const m of html.matchAll(SOUND_RE)) {
    const name = (m[1] ?? '').trim()
    if (name && !sounds.includes(name)) sounds.push(name)
  }
  return { images, sounds }
}

export function isRemoteUrl(src: string): boolean {
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)
}

/** Splits `[sound:x]` tokens out of a field: returns the HTML without them and the names. */
export function extractSounds(html: string): { html: string; sounds: string[] } {
  const sounds: string[] = []
  const rest = html.replace(SOUND_RE, (_m, name: string) => {
    sounds.push(name.trim())
    return ''
  })
  return { html: rest, sounds }
}

export interface ImageRef {
  name: string
  alt: string
}

const IMG_TAG_RE = /<img\b[^>]*>/gi

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null
}

/** Local images of a field with their alt text (editor thumbnails, 04-UI §2.3). */
export function imageRefs(html: string): ImageRef[] {
  const out: ImageRef[] = []
  for (const m of html.matchAll(IMG_TAG_RE)) {
    const src = attr(m[0], 'src')
    if (src && !isRemoteUrl(src) && !out.some((r) => r.name === src)) {
      out.push({ name: src, alt: attr(m[0], 'alt') ?? '' })
    }
  }
  return out
}

export function imageTag(name: string, alt = ''): string {
  return `<img src="${escapeHtml(name)}" alt="${escapeHtml(alt)}">`
}

/** Rewrites every `<img src=name>` tag with the given alt text. */
export function setImageAlt(html: string, name: string, alt: string): string {
  return html.replace(IMG_TAG_RE, (tag) => (attr(tag, 'src') === name ? imageTag(name, alt) : tag))
}

export function removeImage(html: string, name: string): string {
  return html.replace(IMG_TAG_RE, (tag) => (attr(tag, 'src') === name ? '' : tag))
}

export function removeSound(html: string, name: string): string {
  return html.replace(SOUND_RE, (token, n: string) => (n.trim() === name ? '' : token))
}

/** Replaces media references after a rename (import name collisions, 05 §2.3). */
export function renameMediaRefs(html: string, from: string, to: string): string {
  return html
    .replace(IMG_TAG_RE, (tag) =>
      attr(tag, 'src') === from
        ? tag.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `src="${escapeHtml(to)}"`)
        : tag,
    )
    .replace(SOUND_RE, (token, n: string) => (n.trim() === from ? `[sound:${to}]` : token))
}

/** Inserts `snippet` into `text` at [start, end) and returns the new text and caret. */
export function insertAt(text: string, start: number, end: number, snippet: string) {
  return { text: text.slice(0, start) + snippet + text.slice(end), caret: start + snippet.length }
}

/**
 * Duplicate key of a front (05 §1): normalised text plus referenced media names, so that
 * image-only fronts (`<img src="flag-fr.svg">`) are not all duplicates of each other.
 * Empty when there is neither text nor media.
 */
export function frontKey(html: string): string {
  const refs = mediaRefs(html)
  const media = [...refs.images, ...refs.sounds].join('|')
  const text = normalizeText(html)
  return media ? `${text}\u0001${media}` : text
}
