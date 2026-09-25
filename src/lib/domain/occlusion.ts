/**
 * Image occlusion notes (V1): rectangular masks drawn on an image, one card per mask group.
 * Pure: no DOM. Fields of an `image_occlusion` note: [image, masks JSON, header, extra].
 */

export type OcclusionMode = 'hideAll' | 'hideOne'

export interface OcclusionMask {
  /** Card group, 1-based like cloze `cN` (card ord = n - 1); masks sharing `n` form one card. */
  n: number
  /** Normalised to the image (0–1, origin top-left). */
  x: number
  y: number
  w: number
  h: number
  /** Optional answer, shown only after the reveal (P1) and used for typed answers. */
  label?: string
}

export interface Occlusion {
  /** hideAll: every mask covers its area, the target is highlighted; hideOne: only the target. */
  mode: OcclusionMode
  masks: OcclusionMask[]
}

/** Smallest mask side (0.5 % of the image): anything smaller is a misclick. */
export const MIN_MASK_SIZE = 0.005

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const round4 = (v: number) => Math.round(v * 10_000) / 10_000
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/** Keeps a mask inside the image and rounds it to 4 decimals; null when too small or invalid. */
export function normalizeMask(mask: OcclusionMask): OcclusionMask | null {
  const { n, x, y, w, h } = mask
  if (!Number.isInteger(n) || n < 1) return null
  if (![x, y, w, h].every(Number.isFinite)) return null
  const x0 = round4(clamp01(x))
  const y0 = round4(clamp01(y))
  const x1 = round4(clamp01(x + w))
  const y1 = round4(clamp01(y + h))
  if (x1 - x0 < MIN_MASK_SIZE || y1 - y0 < MIN_MASK_SIZE) return null
  const out: OcclusionMask = { n, x: x0, y: y0, w: round4(x1 - x0), h: round4(y1 - y0) }
  const label = mask.label?.trim()
  if (label) out.label = label
  return out
}

/** Tolerant reader of the masks field: empty or invalid JSON gives no masks. */
export function parseOcclusion(json: string): Occlusion {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    raw = null
  }
  const mode: OcclusionMode = isObj(raw) && raw.mode === 'hideOne' ? 'hideOne' : 'hideAll'
  const masks: OcclusionMask[] = []
  const list = isObj(raw) && Array.isArray(raw.masks) ? (raw.masks as unknown[]) : []
  for (const m of list) {
    if (!isObj(m)) continue
    const candidate: OcclusionMask = {
      n: Number(m.n),
      x: Number(m.x),
      y: Number(m.y),
      w: Number(m.w),
      h: Number(m.h),
    }
    if (typeof m.label === 'string') candidate.label = m.label
    const mask = normalizeMask(candidate)
    if (mask) masks.push(mask)
  }
  return { mode, masks }
}

/** Stable JSON for the masks field (version, mode, masks in drawing order). */
export function serializeOcclusion(o: Occlusion): string {
  const masks = o.masks.flatMap((m) => {
    const mask = normalizeMask(m)
    return mask ? [mask] : []
  })
  return JSON.stringify({ v: 1, mode: o.mode, masks })
}

/** Distinct mask groups, ascending. */
export function occlusionGroups(o: Occlusion): number[] {
  return [...new Set(o.masks.map((m) => m.n))].sort((a, b) => a - b)
}

/** Card ords of an occlusion note (invariant 2): one per distinct group, ord = n - 1. */
export function occlusionOrds(o: Occlusion): number[] {
  return occlusionGroups(o).map((n) => n - 1)
}

/** Next group number for a new mask: one more than the highest (same rule as cloze). */
export function nextMaskGroup(o: Occlusion): number {
  return Math.max(0, ...o.masks.map((m) => m.n)) + 1
}

/** Answer labels of group `n`, in drawing order, without duplicates. */
export function maskLabels(o: Occlusion, n: number): string[] {
  const labels: string[] = []
  for (const m of o.masks)
    if (m.n === n && m.label && !labels.includes(m.label)) labels.push(m.label)
  return labels
}

// ─── Anki (23.10+ « Image Occlusion » note type) ──────────────────────────────

/** Anki writes normalised numbers without leading or trailing zeros: 0.25 → ".25", 0 → "0". */
function ankiNumber(v: number): string {
  const s = v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return s.replace(/^0(?=\.)/, '') || '0'
}

/**
 * Anki's occlusion field: one `{{cN::image-occlusion:rect:…}}` per mask joined with `<br>`;
 * `oi=1` ("occlude inactive") means hide all, guess one. Labels have no Anki equivalent.
 */
export function occlusionToAnki(o: Occlusion): string {
  const oi = o.mode === 'hideAll' ? ':oi=1' : ''
  return o.masks
    .map(
      (m) =>
        `{{c${m.n}::image-occlusion:rect:left=${ankiNumber(m.x)}:top=${ankiNumber(m.y)}` +
        `:width=${ankiNumber(m.w)}:height=${ankiNumber(m.h)}${oi}}}`,
    )
    .join('<br>')
}

export interface AnkiOcclusionResult {
  occlusion: Occlusion
  /** Ellipses, polygons and rotated shapes replaced by their bounding rectangle. */
  converted: number
  /** Text shapes, absolute (pixel) coordinates and unreadable shapes. */
  skipped: number
}

const ANKI_SHAPE_RE = /\{\{c(\d+)::image-occlusion:([\s\S]*?)\}\}/g

/** Splits `rect:left=.1:top=.2` on unescaped colons and unescapes `\:` and `\\`. */
function splitShape(body: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '\\' && i + 1 < body.length) current += body[++i]
    else if (c === ':') {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts
}

function boundingBox(shape: string, p: Map<string, string>): [number, number, number, number] {
  const num = (k: string) => Number(p.get(k))
  if (shape === 'rect') return [num('left'), num('top'), num('width'), num('height')]
  if (shape === 'ellipse') return [num('left'), num('top'), 2 * num('rx'), 2 * num('ry')]
  // polygon: points="x,y x,y …"
  const pts = (p.get('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
  const xs = pts.map((q) => q[0] ?? NaN)
  const ys = pts.map((q) => q[1] ?? NaN)
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0]
}

/** Reads Anki's occlusion field into rectangular masks (05 §2.3). */
export function occlusionFromAnki(text: string): AnkiOcclusionResult {
  const masks: OcclusionMask[] = []
  let converted = 0
  let skipped = 0
  let hideAll = false
  for (const match of text.matchAll(ANKI_SHAPE_RE)) {
    const [shape = '', ...props] = splitShape(match[2] ?? '')
    const p = new Map<string, string>()
    for (const prop of props) {
      const eq = prop.indexOf('=')
      if (eq > 0) p.set(prop.slice(0, eq), prop.slice(eq + 1))
    }
    if (p.get('oi') === '1') hideAll = true
    if (shape !== 'rect' && shape !== 'ellipse' && shape !== 'polygon') {
      skipped++
      continue
    }
    const [x, y, w, h] = boundingBox(shape, p)
    // Values above 1 are absolute pixels (early 23.10 notes): the image size is unknown here.
    const mask = [x, y, x + w, y + h].every((v) => v <= 1.0001)
      ? normalizeMask({ n: Number(match[1]), x, y, w, h })
      : null
    if (!mask) {
      skipped++
      continue
    }
    if (shape !== 'rect' || Number(p.get('angle') ?? 0) !== 0) converted++
    masks.push(mask)
  }
  return { occlusion: { mode: hideAll ? 'hideAll' : 'hideOne', masks }, converted, skipped }
}
