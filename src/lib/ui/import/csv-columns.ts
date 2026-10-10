import { fieldColumn, type CsvColumn } from '$lib/import/csv'
import type { NoteType } from '$lib/domain/types'
import { t, type MessageKey } from '$lib/i18n'

const BUILT_IN: { value: CsvColumn; label: MessageKey }[] = [
  { value: 'front', label: 'csv.colFront' },
  { value: 'back', label: 'csv.colBack' },
  { value: 'extra', label: 'csv.colExtra' },
  { value: 'tags', label: 'csv.colTags' },
  { value: 'deck', label: 'csv.colDeck' },
  { value: 'type', label: 'csv.colType' },
  { value: 'ignore', label: 'csv.colIgnore' },
]
const AROUND_FIELDS: readonly CsvColumn[] = ['tags', 'deck', 'ignore']

/** What a CSV column can be mapped to: the built-in fields, or a custom type's fields (M10). */
export function csvColumns(type: NoteType | undefined): { value: CsvColumn; label: string }[] {
  const builtIn = BUILT_IN.map((c) => ({ value: c.value, label: t(c.label) }))
  if (!type) return builtIn
  return [
    ...type.fields.map((name, k) => ({ value: fieldColumn(k), label: name })),
    ...builtIn.filter((c) => AROUND_FIELDS.includes(c.value)),
  ]
}
