import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

async function importApkg(page: Page, file: string) {
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(file)
}

// 05 §4: a deck (with its sub-deck) exported for Anki comes back whole after wiping everything.
test('exports a deck for Anki and re-imports it after wiping everything', async ({
  page,
}, testInfo) => {
  await importApkg(page, sample('sample-legacy.apkg'))
  await page.getByRole('button', { name: 'Importer 4 notes' }).click()
  await expect(page.getByText('4 notes créées')).toBeVisible()

  await page.goto('/#/')
  await page.getByRole('link', { name: 'Géographie', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Géographie/ })).toBeVisible()
  await page.getByRole('button', { name: 'Exporter (CSV, Anki)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Exporter' })
  await dialog.getByLabel('Paquet Anki (.apkg)').check()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Exporter' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^geographie-\d{4}-\d{2}-\d{2}-\d{4}\.apkg$/)
  const file = testInfo.outputPath('geographie.apkg')
  await download.saveAs(file)
  const report = dialog.getByRole('status')
  await expect(report).toContainText('4 notes')
  await expect(report).toContainText('5 cartes')
  await expect(report).toContainText('3 révisions')
  await expect(report).toContainText('1 média')
  await dialog.getByRole('button', { name: 'Fermer' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page.getByLabel('Télécharger une sauvegarde avant d’effacer').uncheck()
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Oui, tout effacer' }).click()
  await expect(page.getByRole('button', { name: 'Créer un paquet' })).toBeVisible()

  await importApkg(page, file)
  await expect(page.getByText(/Notes\s:\s4 · cartes\s:\s5 · médias\s:\s1/)).toBeVisible()
  await expect(page.getByText('Recto · Basique', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Importer 4 notes' }).click()
  await expect(page.getByText('4 notes créées')).toBeVisible()
  await expect(page.getByText('5 cartes créées')).toBeVisible()
  await expect(page.getByText('3 révisions importées')).toBeVisible()
  await expect(page.getByText('1 média importé')).toBeVisible()
  await expect(page.getByText(/Paquets créés.*Géographie, Départements/)).toBeVisible()
  await page.goto('/#/cards')
  await page.getByLabel('État').selectOption({ label: 'Suspendue' })
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()
})

test('CSV export still works; a Recto deck goes to Anki and back without duplicates', async ({
  page,
}, testInfo) => {
  await page.goto('/#/import')
  await page.getByLabel('Fichier CSV ou TSV').setInputFiles(sample('cloze.csv'))
  await page.getByLabel('Nom').fill('Trous')
  await page.getByRole('button', { name: 'Importer 5 lignes' }).click()
  await expect(page.getByText('9 cartes créées')).toBeVisible()

  // CSV from the card browser's selection (default format).
  await page.goto('/#/cards')
  await page.getByLabel('Tout sélectionner').check()
  await page.getByRole('button', { name: 'Exporter (CSV, Anki)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Exporter' })
  await expect(dialog.getByLabel('CSV (tableur)')).toBeChecked()
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Exporter' }).click(),
  ])
  expect(csv.suggestedFilename()).toMatch(/^recto-selection-.*\.csv$/)
  const text = readFileSync(await csv.path(), 'utf8')
  expect(text.split('\r\n')[0]).toBe('\ufeffRecto;Verso;Extra;Tags;Paquet;Type')
  expect(text.trim().split('\r\n')).toHaveLength(6)
  await expect(dialog).toBeHidden()

  // The whole collection for Anki, from the settings.
  await page.goto('/#/settings')
  const [apkg] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter pour Anki (.apkg)' }).click(),
  ])
  expect(apkg.suggestedFilename()).toMatch(/^recto-collection-.*\.apkg$/)
  await expect(page.getByRole('status').filter({ hasText: 'Paquet Anki exporté' })).toContainText(
    '9 cartes',
  )
  const file = testInfo.outputPath('collection.apkg')
  await apkg.saveAs(file)

  // Re-imported into the same collection: recognised (guid = note id), nothing duplicated.
  await importApkg(page, file)
  await page.getByRole('button', { name: 'Importer 5 notes' }).click()
  await expect(page.getByText('0 note créée')).toBeVisible()
  await expect(page.getByText('5 doublons ignorés')).toBeVisible()
  await page.goto('/#/cards')
  await expect(page.getByText('9 cartes')).toBeVisible()
})
