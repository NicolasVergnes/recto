import { applyImportPlan, existingCollection } from '$lib/db/importer'
import { newId } from '$lib/db/schema'
import { defaultMapping, detectModelType, parseCsv, planCsvImport } from '$lib/import/csv'

/**
 * « Essayer avec un paquet d'exemple » (04-UI §2.1): the 101 French départements, bundled as a
 * separate chunk (loaded on demand) and imported with the regular CSV importer.
 */
export async function importSampleDeck(): Promise<string | null> {
  const { default: text } = await import('../../../data/samples/departements.csv?raw')
  const data = parseCsv(text)
  const mapping = defaultMapping(data)
  const plan = planCsvImport(
    data,
    {
      mapping,
      hasHeader: data.headerDetected,
      modelType: detectModelType(data, mapping, data.headerDetected),
      deckId: '',
      newDeckName: 'Géographie',
      duplicates: 'skip',
    },
    await existingCollection(),
    Date.now(),
    newId,
  )
  await applyImportPlan(plan)
  return plan.notes[0]?.deckId ?? null
}
