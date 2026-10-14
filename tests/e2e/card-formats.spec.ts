import { resolve } from 'node:path'
import { expect, test } from './fixtures'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

// M17: a deck learnt in steps, format after format, without splitting its notes.
test('formats left for later at import wait, then come in from the deck settings', async ({
  page,
}) => {
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(sample('multi-template.apkg'))
  const formats = page.getByRole('group', { name: 'Formats de cartes à introduire tout de suite' })
  for (const card of ['QNumero', 'QDept', 'QCh-lieu'])
    await formats.getByLabel(`Departements · ${card}`, { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Importer 3 notes' }).click()
  await expect(page.getByText('11 cartes créées')).toBeVisible()

  // Only the map cards come today: Ain and Aisne have a map, Allier none.
  await page.goto('/#/review')
  await expect(page.getByText(/2 nouvelles/)).toBeVisible()
  const card = page.getByRole('article', { name: 'Carte' })
  for (let i = 0; i < 2; i++) {
    await expect(card).toContainText('Quel est ce département')
    await page.getByRole('button', { name: 'Afficher la réponse' }).click()
    await page.keyboard.press('4')
  }
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()

  // Deck settings: the map cards are started, « QDept » comes in.
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Départements', exact: true }).click()
  const settings = page.getByRole('group', { name: 'Formats de cartes à introduire' })
  await expect(settings.getByLabel(/Departements · Qcarte/)).toBeChecked()
  await expect(settings.locator('label', { hasText: 'Qcarte' })).toContainText(
    '0 nouvelle · 2 commencées',
  )
  await expect(settings.getByLabel(/Departements · QDept/)).not.toBeChecked()
  await settings.getByLabel(/Departements · QDept/).check()
  await settings.getByLabel('Nouvelles cartes format par format').check()
  await page
    .getByRole('region', { name: 'Paramètres de révision' })
    .getByRole('button', { name: 'Enregistrer' })
    .click()
  await expect(page.getByText('Paramètres enregistrés')).toBeVisible()
  await page.goto('/#/review')
  await expect(page.getByText(/3 nouvelles/)).toBeVisible()

  // Browser: the cards of one format, the paused ones included.
  await page.goto('/#/cards')
  await page.getByLabel('Format de carte').selectOption({ label: 'Departements · QCh-lieu' })
  await expect(page.getByText('3 cartes', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Format de carte')).toHaveValue(/:2$/)
})
