import type { ModelType } from '$lib/domain/types'
import type { MessageKey } from '$lib/i18n'

/** Display name of each kind of note (imports): built-in ones are Basique notes (M14). */
export const MODEL_LABEL: Record<ModelType, MessageKey> = {
  basic: 'editor.basicClassic',
  cloze: 'editor.basicCloze',
  image_occlusion: 'editor.basicOcclusion',
  custom: 'editor.custom',
}

/** The card kinds of a Basique note, stored as its model type (M14). */
export const BASIC_KINDS: readonly { value: Exclude<ModelType, 'custom'>; label: MessageKey }[] = [
  { value: 'basic', label: 'editor.classic' },
  { value: 'cloze', label: 'editor.cloze' },
  { value: 'image_occlusion', label: 'editor.imageOcclusion' },
]
