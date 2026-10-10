import { resolve } from 'node:path'
import { expect, test } from './fixtures'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)
const csv = (name: string, text: string) => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.from(text, 'utf8'),
})

// M10: a CSV imported into a custom note type, columns mapped to its fields by name; a second
// file updates a note and its cards follow its new content.
test('a CSV is imported into a custom note type, then updates a note', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(sample('multi-template.apkg'))
  await page.getByRole('button', { name: 'Importer 3 notes' }).click()
  await expect(page.getByText('3 notes créées')).toBeVisible()

  const file = page.getByLabel('Fichier CSV ou TSV')
  await file.setInputFiles(
    csv('regions.csv', 'Numero;Dept;Prefecture\n04;Alpes;Digne\n05;Hautes-Alpes;Gap\n'),
  )
  await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Departements' })
  // The header names the fields: it is recognised, and each column goes to its field.
  await expect(page.getByLabel('La première ligne est un en-tête')).toBeChecked()
  await expect(page.getByLabel('Colonne 1')).toHaveValue('field:0')
  await expect(page.getByLabel('Colonne 2')).toHaveValue('field:1')
  await expect(page.getByLabel('Colonne 3')).toHaveValue('field:3')
  await expect(page.getByText('Doublons (même « Numero » dans le même paquet')).toBeVisible()
  await page.getByLabel('Paquet de destination').selectOption({ label: 'Départements' })
  await page.getByRole('button', { name: 'Importer 2 lignes' }).click()
  // QNumero, QDept and QCh-lieu ask fields the rows have; Qcarte needs a « Carte »: no card.
  await expect(page.getByText('2 notes créées')).toBeVisible()
  await expect(page.getByText('6 cartes créées')).toBeVisible()

  // Same « Numero », a « Carte » now: the note is updated and gains its fourth card.
  await file.setInputFiles(csv('cartes.csv', 'Numero;Carte\n04;<b>carte</b>\n'))
  await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Departements' })
  await page.getByLabel('Paquet de destination').selectOption({ label: 'Départements' })
  await page.getByText('Mettre à jour les champs des colonnes choisies').click()
  await page.getByRole('button', { name: 'Importer 1 ligne' }).click()
  await expect(page.getByText('1 note mise à jour')).toBeVisible()
  await expect(page.getByText('1 carte créée')).toBeVisible()

  await page.goto('/#/cards')
  await expect(page.getByText('18 cartes')).toBeVisible()
})
