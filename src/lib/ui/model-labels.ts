import type { ModelType } from '$lib/domain/types'
import type { MessageKey } from '$lib/i18n'

/** Display name of each note type (editor, imports). */
export const MODEL_LABEL: Record<ModelType, MessageKey> = {
  basic: 'editor.basic',
  cloze: 'editor.cloze',
  image_occlusion: 'editor.imageOcclusion',
  custom: 'editor.custom',
}
