/**
 * Card formats (M17): what a card asks, across the notes of a type. A deck can pause the new
 * cards of a format (`DeckSettings.pausedFormats`) or bring them in format after format
 * (`newByFormat`). Pure.
 *
 * Key: `<noteTypeId>:<template index>` for a custom note's card, its model type (`basic`,
 * `cloze`, `image_occlusion`) for a Basique note's card (M14). Rank: the template index, 0 for
 * Basique: the order of the templates in the note type editor is the order of the steps.
 */
import { templateIndex } from './templates'
import type { Card, ModelType, Note, NoteType } from './types'

export interface CardFormat {
  key: string
  rank: number
}

export function cardFormat(
  note: Pick<Note, 'modelType' | 'noteTypeId'>,
  card: Pick<Card, 'ord'>,
): CardFormat {
  if (note.modelType !== 'custom') return { key: note.modelType, rank: 0 }
  const template = templateIndex(card.ord)
  return { key: `${note.noteTypeId ?? ''}:${template}`, rank: template }
}

/** What names a format in the interface: its note type and template, or its kind of card. */
export interface FormatName {
  key: string
  /** Custom notes: the note type and the template; Basique notes: the kind of card. */
  noteType?: string
  template?: string
  modelType?: Exclude<ModelType, 'custom'>
}

/** The name of the format of a card, with the note type of a custom note. */
export function formatName(
  note: Pick<Note, 'modelType' | 'noteTypeId'>,
  card: Pick<Card, 'ord'>,
  noteType?: Pick<NoteType, 'name' | 'templates'>,
): FormatName & CardFormat {
  const format = cardFormat(note, card)
  if (note.modelType !== 'custom') return { ...format, modelType: note.modelType }
  return {
    ...format,
    noteType: noteType?.name ?? '',
    template: noteType?.templates[format.rank]?.name ?? '',
  }
}

/** Formats in the order of the interface: by note type, then template order. */
export function byFormatOrder(a: FormatName & CardFormat, b: FormatName & CardFormat): number {
  return (
    (a.noteType ?? '').localeCompare(b.noteType ?? '') ||
    a.rank - b.rank ||
    a.key.localeCompare(b.key)
  )
}

/** What a format key designates: a template of a note type, or a Basique kind of card. */
export type ParsedFormat =
  { noteTypeId: string; template: number } | { modelType: Exclude<ModelType, 'custom'> }

export function parseFormat(key: string): ParsedFormat | null {
  if (key === 'basic' || key === 'cloze' || key === 'image_occlusion') return { modelType: key }
  const at = key.lastIndexOf(':')
  const template = Number(key.slice(at + 1))
  if (at <= 0 || !Number.isInteger(template) || template < 0) return null
  return { noteTypeId: key.slice(0, at), template }
}

/**
 * Format keys after an edit of note type `noteTypeId`: a template that moved takes its key along
 * (`moves`: old index → new index), one that was removed or changed kind loses it. Other keys
 * stay as they are. An empty `moves` drops every key of the type (the type was deleted).
 */
export function remapFormats(
  keys: readonly string[],
  noteTypeId: string,
  moves: ReadonlyMap<number, number>,
): string[] {
  return keys.flatMap((key) => {
    const parsed = parseFormat(key)
    if (!parsed || !('noteTypeId' in parsed) || parsed.noteTypeId !== noteTypeId) return [key]
    const to = moves.get(parsed.template)
    return to === undefined ? [] : [`${noteTypeId}:${to}`]
  })
}
