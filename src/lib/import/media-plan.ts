/**
 * Media of an imported package, shared by the Anki (05 §2.3) and Recto (05 §5) packages. Pure
 * (async only for sha256).
 */
import { mediaRefs, renameMediaRefs } from '../domain/text'
import type { Note } from '../domain/types'
import { sha256Hex } from '../media/hash'
import { mediaKind, mimeFromName } from '../media/mime'
import type { ImportMedia, ImportPlan } from './plan'

export interface PackageMedia {
  name: string
  data: Uint8Array<ArrayBuffer>
}

function uniqueName(name: string, taken: (n: string) => boolean): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!taken(candidate)) return candidate
  }
}

/**
 * Adds the package's media to `plan`: stored under their real names, a file Recto already has
 * (same name, same content) is not imported again, a name taken by different content gets a
 * suffix and the references of the planned notes are rewritten; a file of an unknown type is
 * skipped. The names the notes cite that exist nowhere are reported missing.
 */
export async function planMedia(
  plan: ImportPlan,
  files: readonly PackageMedia[],
  existing: ReadonlyMap<string, string>,
  missingFiles: readonly string[] = [],
): Promise<void> {
  const renames = new Map<string, string>()
  const imported = new Set<string>()
  const media: ImportMedia[] = []
  for (const m of files) {
    const mime = mimeFromName(m.name)
    if (!mime || !mediaKind(mime)) {
      plan.report.skipped++
      continue
    }
    const sha = await sha256Hex(m.data)
    const known = existing.get(m.name)
    let name = m.name
    if (known === sha) continue
    if (known !== undefined) {
      name = uniqueName(m.name, (n) => existing.has(n) || imported.has(n))
      renames.set(m.name, name)
    }
    imported.add(name)
    media.push({ name, blob: new Blob([m.data], { type: mime }), mime })
  }
  if (renames.size > 0) {
    const rewrite = (note: Note): Note => {
      let fields = note.fields
      for (const [from, to] of renames) fields = fields.map((f) => renameMediaRefs(f, from, to))
      return { ...note, fields }
    }
    plan.notes = plan.notes.map(rewrite)
    plan.updates = plan.updates.map(rewrite)
  }
  plan.media = media

  const available = new Set([
    ...existing.keys(),
    ...imported,
    ...files.map((m) => renames.get(m.name) ?? m.name),
  ])
  const missing = new Set(missingFiles)
  for (const note of [...plan.notes, ...plan.updates]) {
    for (const field of note.fields) {
      const refs = mediaRefs(field)
      for (const name of [...refs.images, ...refs.sounds])
        if (!available.has(name)) missing.add(name)
    }
  }
  plan.report.mediaImported = plan.media.length
  plan.report.missingMedia = [...missing].sort()
}
