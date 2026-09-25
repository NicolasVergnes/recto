import { expect, test } from './fixtures'

// E2E 1 (06 §4): first launch → create a deck → add 3 notes (basic, reverse, cloze)
// → 5 cards visible in the card browser.
test('create a deck and three notes, then see five cards', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nouveau paquet' })
  await dialog.getByLabel('Nom').fill('Géographie')
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Géographie/ })).toBeVisible()

  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle note' })).toBeVisible()
  await expect(page.getByLabel('Paquet')).toHaveValue(/.+/)

  // Basic
  await page.getByLabel('Recto').fill('Capitale de la France')
  await page.getByLabel('Verso', { exact: true }).fill('Paris')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (1 carte)')).toBeVisible()
  await expect(page.getByLabel('Recto')).toHaveValue('')
  await expect(page.getByLabel('Recto')).toBeFocused()

  // Basic + reverse, submitted with Ctrl+Enter
  await page.getByLabel('Type').selectOption({ label: 'Basique + inverse' })
  await page.getByLabel('Recto').fill('Chien')
  await page.getByLabel('Verso', { exact: true }).fill('Dog')
  await page.getByLabel('Verso', { exact: true }).press('Control+Enter')
  await expect(page.getByText('Note ajoutée (2 cartes)')).toBeVisible()

  // Cloze with two deletions
  await page.getByLabel('Type').selectOption({ label: 'Texte à trous' })
  await page
    .getByLabel('Texte', { exact: true })
    .fill('La {{c1::Lune}} tourne autour de la {{c2::Terre}}.')
  await expect(page.getByText('Cette note produira 2 cartes.')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter et fermer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Géographie/ })).toBeVisible()
  await expect(page.getByText('5 cartes')).toBeVisible()

  await page.getByRole('link', { name: 'Voir les cartes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cartes' })).toBeVisible()
  await expect(page.getByText('5 cartes')).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(6)
  await expect(page.getByRole('link', { name: 'La […] tourne autour de la Terre.' })).toBeVisible()
})

test('the editor warns about long fields and duplicates without blocking', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Tests')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await page.getByRole('link', { name: 'Ajouter une note' }).click()

  await page.getByLabel('Recto').fill('a, b, c, d, e, f')
  await expect(page.getByText('On dirait une liste')).toBeVisible()
  await page.getByLabel('Recto').fill('x'.repeat(201))
  await expect(page.getByText('Plus de 200 caractères')).toBeVisible()

  await page.getByLabel('Recto').fill('Bonjour')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByLabel('Recto')).toHaveValue('')
  await page.getByLabel('Recto').fill('  bonjour ')
  await expect(
    page.getByText('Une carte avec le même recto existe déjà dans ce paquet.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toBeEnabled()
})
