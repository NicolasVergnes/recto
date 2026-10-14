import type { Download, Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function createDeck(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

async function askToDelete(page: Page) {
  await page
    .getByRole('region', { name: 'Organisation' })
    .getByRole('button', { name: 'Supprimer' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Supprimer le paquet' })
  await expect(dialog.getByLabel('Télécharger une sauvegarde avant de supprimer')).not.toBeChecked()
  return dialog
}

test('deleting a deck offers the backup without forcing it', async ({ page }) => {
  const downloads: Download[] = []
  page.on('download', (d) => downloads.push(d))

  // Unchecked (the default): the deck is deleted, nothing is downloaded.
  await createDeck(page, 'Sans sauvegarde')
  let dialog = await askToDelete(page)
  await dialog.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Paquet supprimé', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Sans sauvegarde/ })).toHaveCount(0)
  expect(downloads).toHaveLength(0)

  // Checked: the full backup is downloaded before the deletion.
  await createDeck(page, 'Avec sauvegarde')
  dialog = await askToDelete(page)
  await dialog.getByLabel('Télécharger une sauvegarde avant de supprimer').check()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Supprimer' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^recto-avant-suppression.*\.recto\.zip$/)
  await expect(page.getByText('Paquet supprimé (sauvegarde téléchargée)')).toBeVisible()
})
