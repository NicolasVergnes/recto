import Papa from 'papaparse'
import type { Note } from '../domain/types'

export type CsvDelimiter = ';' | '\t'

export interface CsvExportRow {
  note: Note
  deckPath: string
}

/** Header re-imported as is by the CSV importer (named columns, 05 §1). */
export const CSV_HEADER = ['Recto', 'Verso', 'Extra', 'Tags', 'Paquet', 'Type']

/** Image occlusion notes have no CSV form (masks are not text): the backup keeps them. */
export function csvExportable(note: Pick<Note, 'modelType'>): boolean {
  return note.modelType !== 'image_occlusion'
}

/**
 * CSV export (SPEC §5.5, 05 §1): `;` (Excel FR) or tab, UTF-8 with BOM, CRLF, quotes escaped by
 * papaparse. Media are not included; their file names stay in the fields. Notes that have no
 * CSV form (`csvExportable`) are left out.
 */
export function notesToCsv(rows: readonly CsvExportRow[], delimiter: CsvDelimiter = ';'): string {
  const data = rows
    .filter(({ note }) => csvExportable(note))
    .map(({ note, deckPath }) => {
      const [f0 = '', f1 = '', f2 = ''] = note.fields
      const tags = note.tags.join(' ')
      return note.modelType === 'cloze'
        ? [f0, '', f1, tags, deckPath, note.modelType]
        : [f0, f1, f2, tags, deckPath, note.modelType]
    })
  return `\ufeff${Papa.unparse({ fields: CSV_HEADER, data }, { delimiter, newline: '\r\n' })}`
}
