import type { FormatName } from '$lib/domain/formats'
import { t } from '$lib/i18n'
import { MODEL_LABEL } from './model-labels'

/** « Département · Carte → Nom », « Basique · texte à trous » (M17). */
export function formatLabel(format: FormatName): string {
  return format.modelType
    ? t(MODEL_LABEL[format.modelType])
    : `${format.noteType ?? ''} · ${format.template ?? ''}`
}
