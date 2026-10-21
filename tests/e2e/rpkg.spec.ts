import { expect, test } from './fixtures'

// M20: a deck goes out as a Recto package (.rpkg) and comes back on another device, with its
// settings but not the progress; importing it again makes no duplicate.
test('a deck is exported as a Recto package and imported on a fresh device, once', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Astronomie')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Astronomie' })).toBeVisible()
  await page.getByLabel('Nouvelles cartes par jour').fill('7')
  await page.getByRole('button', { name: 'Enregistrer' }).last().click()
  await expect(page.getByText('Paramètres enregistrés')).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  for (const [front, back] of [
    ['Soleil', 'Sun'],
    ['Lune', 'Moon'],
  ] as const) {
    await page.getByLabel('Recto').fill(front)
    await page.getByLabel('Verso', { exact: true }).fill(back)
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByLabel('Recto')).toHaveValue('')
  }

  await page.goto('/#/')
  await page.getByRole('link', { name: 'Astronomie', exact: true }).click()
  await page.getByRole('button', { name: 'Exporter', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Exporter' })
  await expect(dialog.getByRole('radio', { name: /^Paquet Recto \(\.rpkg\)/ })).toBeChecked()
  await dialog.getByLabel('Auteur (facultatif)').fill('Nicolas')
  await dialog.getByLabel('Licence').selectOption({ label: 'CC0 (domaine public)' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Exporter' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('astronomie.rpkg')
  const file = testInfo.outputPath('astronomie.rpkg')
  await download.saveAs(file)
  await expect(page.getByText('Paquet exporté (2 notes)')).toBeVisible()

  // Another device: everything wiped.
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page.getByLabel('Télécharger une sauvegarde avant d’effacer').uncheck()
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Oui, tout effacer' }).click()
  await expect(page.getByRole('button', { name: 'Créer un paquet' })).toBeVisible()

  await page.goto('/#/import')
  await page.getByLabel('Paquet Recto (.rpkg)').setInputFiles(file)
  await expect(page.getByText('par Nicolas')).toBeVisible()
  await expect(page.getByText(/^Notes\s:\s2/)).toBeVisible()
  await expect(page.getByText('CC0 1.0')).toBeVisible()
  await page
    .getByLabel('Planificateur des paquets créés')
    .first()
    .selectOption({ label: 'Boîte de Leitner (5 compartiments)' })
  await page.getByRole('button', { name: 'Importer 2 notes' }).first().click()
  const report = page.getByRole('status').filter({ hasText: 'Rapport d’import' })
  await expect(report).toContainText('2 notes créées')
  await expect(report).toContainText('Paquets créés : Astronomie')

  await page.goto('/#/')
  await expect(page.getByText('2 notes · 2 cartes')).toBeVisible()
  await page.getByRole('link', { name: 'Astronomie', exact: true }).click()
  await expect(page.getByLabel('Nouvelles cartes par jour')).toHaveValue('7')
  await expect(page.getByLabel('Boîte de Leitner (5 compartiments)', { exact: true })).toBeChecked()

  // The same package again: already there, nothing doubled.
  await page.goto('/#/cards')
  await page.goto('/#/import')
  await page.getByLabel('Paquet Recto (.rpkg)').setInputFiles(file)
  await expect(page.getByText('2 notes sont déjà dans Recto')).toBeVisible()
  await expect(page.getByText('existe déjà')).toBeVisible()
  await page.getByRole('button', { name: 'Importer 2 notes' }).first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Rapport d’import' })).toContainText(
    '2 doublons ignorés',
  )
  await page.goto('/#/')
  await expect(page.getByText('2 notes · 2 cartes')).toBeVisible()
})
