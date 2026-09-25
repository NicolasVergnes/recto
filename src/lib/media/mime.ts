/** MIME whitelist (SPEC §5.2, dexie-local-first §4). Pure. */
export const IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const
export const AUDIO_MIMES = [
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
] as const

export type MediaKind = 'image' | 'audio'

export const MAX_IMAGE_BYTES = 600 * 1024
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024
export const MAX_IMAGE_SIDE = 1280

const EXTENSIONS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
}

const PREFERRED_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
}

/** Strips parameters: "audio/webm;codecs=opus" → "audio/webm". */
export function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase()
}

export function mediaKind(mime: string): MediaKind | null {
  const m = baseMime(mime)
  if ((IMAGE_MIMES as readonly string[]).includes(m)) return 'image'
  if ((AUDIO_MIMES as readonly string[]).includes(m)) return 'audio'
  return null
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** MIME guessed from a file name (imports, where the type is unknown). */
export function mimeFromName(name: string): string | null {
  return EXTENSIONS[extensionOf(name)] ?? null
}

export function extensionFor(mime: string): string {
  return PREFERRED_EXT[baseMime(mime)] ?? 'bin'
}

/** Slug of a file name without extension: "Drapeau France.PNG" → "drapeau-france". */
export function slugify(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const slug = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'media'
}

/** Unique media name `<8 hex>-<slug>.<ext>` (dexie-local-first §4). */
export function mediaFileName(originalName: string, sha256: string, mime: string): string {
  return `${sha256.slice(0, 8)}-${slugify(originalName)}.${extensionFor(mime)}`
}

/** Target size fitting within `max` × `max`, never upscaling. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
