import type { ModelType } from '$lib/domain/types'
import type { MessageKey } from '$lib/i18n'

/** A text field of the form: its label and the index of the note field it edits. */
export interface FieldSlot {
  label: MessageKey
  index: number
}

const BASIC: readonly FieldSlot[] = [
  { label: 'editor.front', index: 0 },
  { label: 'editor.back', index: 1 },
  { label: 'editor.extra', index: 2 },
]

/**
 * Text fields shown for each note type, in form order. A type with its own editor lists only its
 * text fields: a note field that is not listed is never shown nor written by the text form. The
 * first slot is the main text: focused first, taller, followed by the duplicate and cloze
 * messages. The duplicate check (Editor) and `NoteDraft.complete`/`clozeMissing` read
 * `fields[0]`, the front of every type (the image of an occlusion note, whose duplicate check is
 * skipped).
 */
export const SLOTS: Record<ModelType, readonly FieldSlot[]> = {
  basic: BASIC,
  basic_reverse: BASIC,
  cloze: [
    { label: 'editor.text', index: 0 },
    { label: 'editor.extra', index: 1 },
  ],
  // Image and masks (fields 0–1) are edited by OcclusionEditor.
  image_occlusion: [
    { label: 'editor.header', index: 2 },
    { label: 'editor.extra', index: 3 },
  ],
}

/**
 * The note field that receives media and cloze wrapping: the last focused one (`active`, clamped
 * to the note's fields as after a basic → cloze change) when its slot is shown, else the first
 * slot.
 */
export function targetField(
  slots: readonly FieldSlot[],
  fieldCount: number,
  active: number | undefined,
): number {
  const first = slots[0]?.index ?? 0
  const i = Math.min(active ?? first, fieldCount - 1)
  return slots.some((s) => s.index === i) ? i : first
}
