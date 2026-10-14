import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

test('the card browser exports its selection as CSV', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByLabel('Fichier CSV ou TSV').setInputFiles(sample('cloze.csv'))
  await page.getByLabel('Nom').fill('Trous')
  await page.getByRole('button', { name: 'Importer 5 lignes' }).click()
  await expect(page.getByText('9 cartes créées')).toBeVisible()

  await page.goto('/#/cards')
  await page.getByLabel('Tout sélectionner').check()
  await page.getByRole('button', { name: 'Exporter (CSV)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Exporter' })
  await expect(dialog.getByLabel('Point-virgule (Excel en français)')).toBeChecked()
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Exporter' }).click(),
  ])
  expect(csv.suggestedFilename()).toMatch(/^recto-selection-.*\.csv$/)
  const text = readFileSync(await csv.path(), 'utf8')
  expect(text.split('\r\n')[0]).toBe('﻿Recto;Verso;Extra;Tags;Paquet;Type')
  expect(text.trim().split('\r\n')).toHaveLength(6)
  await expect(dialog).toBeHidden()

  // Recto exports nothing for Anki any more (M18).
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Sauvegarde' })).toBeVisible()
  await expect(page.getByText(/Anki/)).toHaveCount(0)
})
