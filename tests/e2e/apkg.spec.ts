import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

// E2E 4 (06 §4): import the .apkg fixture → correct report.
test('imports the legacy Anki fixture with its history and media', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(sample('sample-legacy.apkg'))
  await expect(page.getByText(/Notes\s:\s4 · cartes\s:\s5 · médias\s:\s1/)).toBeVisible()
  await expect(page.getByText('Géographie::Départements')).toBeVisible()
  await expect(page.getByLabel('Importer l’historique de révisions')).toBeChecked()

  await page.getByRole('button', { name: 'Importer 4 notes' }).click()
  await expect(page.getByText('4 notes créées')).toBeVisible()
  await expect(page.getByText('5 cartes créées')).toBeVisible()
  await expect(page.getByText('3 révisions importées')).toBeVisible()
  await expect(page.getByText('1 média importé')).toBeVisible()
  await expect(page.getByText(/Paquets créés.*Géographie, Départements/)).toBeVisible()

  await page.goto('/#/cards')
  await expect(page.getByText('5 cartes')).toBeVisible()
  await page.getByLabel('État').selectOption({ label: 'Suspendue' })
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()
  await page.getByLabel('État').selectOption({ label: 'Tous les états' })
  await page.getByRole('link', { name: /La \[…\] tourne autour/ }).click()
  await expect(page.locator('.preview img').first()).toHaveAttribute('src', /^blob:/)
})

test('refuses the anki21b format with an explanation', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(sample('unsupported-anki21b.apkg'))
  await expect(page.getByRole('alert')).toContainText('nouveau format Anki')
  await expect(page.getByRole('alert')).toContainText(
    'Prise en charge des anciennes versions d’Anki',
  )
})
