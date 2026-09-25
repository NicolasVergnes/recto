import { RepoError } from '../db/errors'
import { db } from '../db/schema'
import { mediaRefs } from '../domain/text'
import type { Media } from '../domain/types'
import { sanitizeSvg } from '../sanitize'
import { sha256Hex } from './hash'
import {
  baseMime,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  mediaFileName,
  mediaKind,
  mimeFromName,
} from './mime'
import { resizeImage, type EncodedImage } from './resize'

export type Resizer = (blob: Blob) => Promise<EncodedImage & { resized: boolean }>

const defaultResizer: Resizer = async (blob) => {
  const bitmap = await createImageBitmap(blob)
  const original = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  const out = await resizeImage(blob)
  return { ...out, resized: out.width !== original.width || out.height !== original.height }
}

/** Resolves the effective MIME type of a file from its type or, failing that, its name. */
export function detectMime(file: Blob, name: string): string {
  return baseMime(file.type) || mimeFromName(name) || ''
}

interface ProcessedMedia {
  blob: Blob
  mime: string
  sha256: string
}

/**
 * Validates and processes a media file (SPEC §5.2): whitelist, raster images resized and
 * re-encoded, SVG sanitised, size limits.
 */
async function processMedia(file: Blob, name: string, resize: Resizer): Promise<ProcessedMedia> {
  const mime = detectMime(file, name)
  const kind = mediaKind(mime)
  if (!kind) throw new RepoError('mediaType')
  let blob: Blob = file
  let finalMime = mime
  if (mime === 'image/svg+xml') {
    blob = new Blob([sanitizeSvg(await file.text())], { type: mime })
  } else if (kind === 'image' && mime !== 'image/gif') {
    let encoded: Awaited<ReturnType<Resizer>>
    try {
      encoded = await resize(file)
    } catch {
      throw new RepoError('mediaUnreadable')
    }
    // Keep an already small original when re-encoding would not help.
    if (encoded.resized || encoded.blob.size < file.size) {
      blob = encoded.blob
      finalMime = baseMime(encoded.blob.type)
    }
  }
  const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES
  if (blob.size > limit) throw new RepoError('mediaTooLarge')
  if (blob.type !== finalMime) blob = new Blob([blob], { type: finalMime })
  return { blob, mime: finalMime, sha256: await sha256Hex(blob) }
}

/** Media added in the editor: stored under a new unique name, deduplicated by content. */
export async function addMediaFile(
  file: Blob,
  originalName: string,
  now: number,
  resize: Resizer = defaultResizer,
): Promise<Media> {
  const p = await processMedia(file, originalName, resize)
  const existing = await db.media.where('sha256').equals(p.sha256).first()
  if (existing) return existing
  const media: Media = {
    name: mediaFileName(originalName, p.sha256, p.mime),
    blob: p.blob,
    mime: p.mime,
    size: p.blob.size,
    sha256: p.sha256,
    createdAt: now,
  }
  await db.media.put(media)
  return media
}

/**
 * Media whose name is already referenced by imported notes (CSV "missing media", 05 §1): the
 * file is processed like in the editor but stored under exactly that name.
 */
export async function addNamedMedia(
  file: Blob,
  name: string,
  now: number,
  resize: Resizer = defaultResizer,
): Promise<Media> {
  const p = await processMedia(file, name, resize)
  const media: Media = {
    name,
    blob: p.blob,
    mime: p.mime,
    size: p.blob.size,
    sha256: p.sha256,
    createdAt: now,
  }
  await db.media.put(media)
  return media
}

export function getMedia(name: string): Promise<Media | undefined> {
  return db.media.get(name)
}

/** Names of stored media referenced by no note field (dexie-local-first §4). */
export async function findOrphanMedia(): Promise<string[]> {
  const referenced = new Set<string>()
  await db.notes.each((note) => {
    for (const field of note.fields) {
      const refs = mediaRefs(field)
      for (const name of refs.images) referenced.add(name)
      for (const name of refs.sounds) referenced.add(name)
    }
  })
  const names = await db.media.toCollection().primaryKeys()
  return names.filter((name) => !referenced.has(name))
}

/** Media names referenced by notes but missing from the table (invariant 5 report). */
export async function findMissingMedia(): Promise<string[]> {
  const missing = new Set<string>()
  const names = new Set(await db.media.toCollection().primaryKeys())
  await db.notes.each((note) => {
    for (const field of note.fields) {
      const refs = mediaRefs(field)
      for (const name of [...refs.images, ...refs.sounds]) if (!names.has(name)) missing.add(name)
    }
  })
  return [...missing].sort()
}

export async function deleteMedia(names: readonly string[]): Promise<void> {
  await db.media.bulkDelete([...names])
}
