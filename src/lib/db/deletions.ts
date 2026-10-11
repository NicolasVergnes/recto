/**
 * Deletions (« pierres tombales », 02-DATA-MODEL §5, M12): every row a user action or an import
 * deletes is recorded, in the transaction of the deletion, so that merging a backup from another
 * device never brings it back. Never pruned for now; « Tout effacer » drops them with the rest.
 */
import type { Deletion, DeletionTable } from '../domain/types'
import { db } from './schema'

export function deletionId(table: DeletionTable, recordId: string): string {
  return `${table}:${recordId}`
}

export function deletionRows(table: DeletionTable, ids: Iterable<string>, now: number): Deletion[] {
  return [...ids].map((recordId) => ({
    id: deletionId(table, recordId),
    table,
    recordId,
    deletedAt: now,
  }))
}

/** Records deleted rows; call it inside the deleting transaction (with `db.deletions` in scope). */
export async function recordDeletions(
  table: DeletionTable,
  ids: Iterable<string>,
  now: number,
): Promise<void> {
  const rows = deletionRows(table, ids, now)
  if (rows.length > 0) await db.deletions.bulkPut(rows)
}
