import { expect, test } from './fixtures'
import { resolve } from 'node:path'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

// E2E 3 (06 §4): sample CSV deck → 101 cards → review 5.
test('the sample deck imports 101 cards and five can be reviewed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Départements/ })).toBeVisible()
  await expect(page.getByText('101 cartes')).toBeVisible()

  await page.goto('/#/')
  await expect(page.getByText('20 nouvelles')).toBeVisible()
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  const card = page.getByRole('article', { name: 'Carte' })
  for (let i = 1; i <= 5; i++) {
    await expect(card).toContainText(`Département ${String(i).padStart(2, '0')}`)
    await page.keyboard.press('Space')
    await expect(card).toContainText('Préfecture')
    await page.keyboard.press('3')
  }
  await expect(page.getByText('15 nouvelles')).toBeVisible()
  await expect(page.getByText('5 en apprentissage')).toBeVisible()
})

test('CSV import screen: preview, report, missing media and cloze detection', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByLabel('Fichier CSV ou TSV').setInputFiles(sample('drapeaux.csv'))
  await expect(page.getByText('11 lignes à importer, séparateur tabulation.')).toBeVisible()
  await expect(page.getByLabel('La première ligne est un en-tête')).toBeChecked()
  await expect(page.getByLabel('Colonne 1')).toHaveValue('front')
  await page.getByLabel('Nom').fill('Drapeaux')
  await page.getByRole('button', { name: 'Importer 11 lignes' }).click()
  await expect(page.getByText('11 notes créées')).toBeVisible()
  await expect(page.getByText(/10 fichiers médias référencés sont absents/)).toBeVisible()

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="1" height="2" fill="#002395"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ed2939"/></svg>'
  await page
    .getByLabel('Ajouter les fichiers médias')
    .setInputFiles({ name: 'flag-fr.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
  await expect(page.getByText('1 média ajouté')).toBeVisible()
  await expect(page.getByText(/9 fichiers médias référencés sont absents/)).toBeVisible()

  // Second import: cloze.csv → 5 notes, 9 cards, into the existing deck.
  await page.getByLabel('Fichier CSV ou TSV').setInputFiles(sample('cloze.csv'))
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('cloze')
  await page.getByLabel('Paquet de destination').selectOption({ label: 'Drapeaux' })
  await page.getByRole('button', { name: 'Importer 5 lignes' }).click()
  await expect(page.getByText('9 cartes créées')).toBeVisible()

  await page.goto('/#/cards')
  await expect(page.getByText('20 cartes')).toBeVisible()
  // The flag stored under its referenced name renders from IndexedDB.
  await page.getByLabel('Rechercher').fill('France')
  await page
    .getByRole('link', { name: /—|France/ })
    .first()
    .click()
  await expect(page.locator('.preview img').first()).toHaveAttribute('src', /^blob:/)
})

// E2E 5 (06 §4): backup → wipe → restore → same counts.
test('backup, wipe everything, restore: same counts', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByText('101 cartes')).toBeVisible()

  await page.goto('/#/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sauvegarder maintenant' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(
    /^recto-sauvegarde-\d{4}-\d{2}-\d{2}-\d{4}\.recto\.zip$/,
  )
  const file = testInfo.outputPath('backup.recto.zip')
  await download.saveAs(file)
  await expect(page.getByText(/Dernière sauvegarde/)).toBeVisible()

  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page.getByLabel('Télécharger une sauvegarde avant d’effacer').uncheck()
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Oui, tout effacer' }).click()
  await expect(page.getByRole('button', { name: 'Créer un paquet' })).toBeVisible()

  await page.goto('/#/import')
  await page.getByText('Sauvegarde Recto').first().click()
  await page.getByLabel('Sauvegarde Recto').setInputFiles(file)
  await expect(page.getByText(/cartes\s:\s101/)).toBeVisible()
  await page.getByLabel('Remplacer toutes les données').check()
  await page.getByRole('button', { name: 'Restaurer' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remplacer toutes les données' })
    .click()
  await expect(page.getByText('Sauvegarde restaurée')).toBeVisible()

  await page.goto('/#/cards')
  await expect(page.getByText('101 cartes')).toBeVisible()
  await page.goto('/#/')
  await expect(page.getByRole('link', { name: 'Géographie', exact: true })).toBeVisible()
})
