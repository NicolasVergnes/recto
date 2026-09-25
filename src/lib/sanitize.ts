import DOMPurify from 'dompurify'

/** Whitelist for card fields (07-ROADMAP M1): b i u br p ul ol li img sub sup span. */
const ALLOWED_TAGS = ['b', 'i', 'u', 'br', 'p', 'ul', 'ol', 'li', 'img', 'sub', 'sup', 'span']
const ALLOWED_ATTR = ['src', 'alt', 'title', 'class']

const fields = DOMPurify(window)
// Images never load by themselves: `src` becomes `data-media`, resolved from IndexedDB by
// CardContent. Remote URLs are therefore never fetched (SPEC §6, privacy).
fields.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src')
    node.removeAttribute('src')
    if (src) node.setAttribute('data-media', src)
  }
})

/** Common Anki markup mapped onto the whitelist before sanitising. */
function normalizeMarkup(html: string): string {
  return html
    .replace(/<(\/?)strong\b/gi, '<$1b')
    .replace(/<(\/?)em\b/gi, '<$1i')
    .replace(/<div\b[^>]*>/gi, '')
    .replace(/<\/div>/gi, '<br>')
}

/** The only way field HTML reaches the DOM. */
export function sanitize(html: string): string {
  return fields.sanitize(normalizeMarkup(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

const svg = DOMPurify(window)

/** SVG files are sanitised before storage (dexie-local-first §4). */
export function sanitizeSvg(markup: string): string {
  return svg.sanitize(markup, { USE_PROFILES: { svg: true, svgFilters: true } })
}
