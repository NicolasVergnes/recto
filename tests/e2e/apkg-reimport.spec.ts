import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { unzipSync, zipSync } from 'fflate'
import initSqlJs from 'sql.js'
import { expect, test } from './fixtures'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

/** `multi-template.apkg` as Anki exports it after edits: SQL statements run on its collection. */
async function editedSample(statements: string[]): Promise<Uint8Array> {
  const SQL = await initSqlJs()
  const { 'collection.anki21': collection, ...rest } = unzipSync(
    new Uint8Array(readFileSync(sample('multi-template.apkg'))),
  )
  if (!collection) throw new Error('no collection in the sample')
  const db = new SQL.Database(collection)
  for (const sql of statements) db.run(sql)
  const edited = db.export()
  db.close()
  return zipSync({ ...rest, 'collection.anki21': edited })
}

/** Anki joins the fields with U+001F; the fifth one (Région) stays empty. */
const fields = (number: string, name: string, map: string, prefecture: string) =>
  [number, name, map, prefecture, '']
    .map((field) => `'${field.replaceAll("'", "''")}'`)
    .join(' || char(31) || ')

/** Anki's `mod` is in seconds: an hour later than the sample's, so that the note is newer. */
const edit = (guid: string, flds: string) =>
  `UPDATE notes SET flds = ${flds}, mod = mod + 3600 WHERE guid = '${guid}'`

async function importApkg(page: Page, file: string) {
  // Another route first: the import screen starts afresh, with its section closed.
  await page.goto('/#/cards')
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(file)
  await page.getByRole('button', { name: 'Importer 3 notes' }).click()
}

// 05 §2.3 (M10): a note edited in Anki comes back with its cards following its new content.
test('re-imports notes edited in Anki: cards created and removed, the others left alone', async ({
  page,
}, testInfo) => {
  await importApkg(page, sample('multi-template.apkg'))
  await expect(page.getByText('3 notes créées')).toBeVisible()
  await expect(page.getByText('11 cartes créées')).toBeVisible()

  // In Anki: Allier gets a map (its « Qcarte » card appears), Ain and Aisne lose theirs.
  const file = testInfo.outputPath('edited.apkg')
  writeFileSync(
    file,
    await editedSample([
      edit('dEpT03cccc', fields('03', 'Allier', 'Carte de l’Allier', 'Moulins')),
      edit('dEpT01aaaa', fields('01', 'Ain', '', 'Bourg-en-Bresse')),
      edit('dEpT02bbbb', fields('02', 'Aisne', '', 'Laon')),
    ]),
  )
  await importApkg(page, file)
  const report = page.getByRole('status').filter({ hasText: 'Rapport d’import' })
  await expect(report).toContainText('0 note créée')
  await expect(report).toContainText('1 carte créée')
  await expect(report).toContainText('3 notes mises à jour')
  await expect(report).toContainText('2 cartes supprimées')
  await expect(report).toContainText('historique conservé')
  await expect(report).not.toContainText('doublon')

  await page.goto('/#/cards')
  await expect(page.getByText('10 cartes')).toBeVisible()
  await page.getByLabel('Rechercher').fill('Quel est ce département')
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()

  // The same package again: no note is newer than the one in Recto, nothing changes.
  await importApkg(page, file)
  await expect(page.getByText('3 doublons ignorés')).toBeVisible()
  await page.goto('/#/cards')
  await expect(page.getByText('10 cartes')).toBeVisible()
})
