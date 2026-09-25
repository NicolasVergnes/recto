import { expect, test, type Page } from '@playwright/test'

async function deckWithNotes(page: Page, name: string, notes: [string, string][]) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  for (const [front, back] of notes) {
    await page.getByLabel('Recto').fill(front)
    await page.getByLabel('Verso', { exact: true }).fill(back)
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(page.getByLabel('Recto')).toHaveValue('')
  }
}

// E2E 2 (06 §4): hidden answer, reveal, rate, counter decremented, undo, rate again.
test('review: reveal, rate, undo and rate again', async ({ page }) => {
  await deckWithNotes(page, 'Capitales', [
    ['Capitale de l’Italie', 'Rome'],
    ['Capitale de l’Espagne', 'Madrid'],
  ])
  await page.goto('/#/')
  await expect(page.getByText('2 nouvelles')).toBeVisible()
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()

  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card).toContainText('Capitale de l’Italie')
  // P1: the answer is not in the page before asking for it.
  await expect(page.getByText('Rome')).toHaveCount(0)
  await expect(page.getByText('2 nouvelles')).toBeVisible()

  await page.keyboard.press('Space')
  await expect(card).toContainText('Rome')
  const good = page.getByRole('button', { name: /^Bien/ })
  await expect(good).toContainText('10 min')
  await expect(page.getByRole('button', { name: /^Encore/ })).toBeFocused()
  await page.keyboard.press('3')

  await expect(card).toContainText('Capitale de l’Espagne')
  await expect(page.getByText('1 nouvelle', { exact: true })).toBeVisible()
  await expect(page.getByText('1 en apprentissage')).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(card).toContainText('Capitale de l’Italie')
  await expect(page.getByText('Rome')).toHaveCount(0)
  await expect(page.getByText('2 nouvelles')).toBeVisible()

  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await page.getByRole('button', { name: /^Facile/ }).click()
  await expect(card).toContainText('Capitale de l’Espagne')
  await expect(page.getByText('0 en apprentissage')).toBeVisible()
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await page.getByRole('button', { name: /^Encore/ }).click()

  // Only a learning card due in 10 min remains: wait or finish.
  await expect(
    page.getByRole('heading', { name: 'Encore quelques cartes en apprentissage' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Recto' })).toBeVisible()
  await expect(page.getByText('0 nouvelle', { exact: true })).toBeVisible()
})

test('Memory Box decks show boxes under the rating buttons', async ({ page }) => {
  await deckWithNotes(page, 'Boîte', [['Soleil', 'Sun']])
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Boîte', exact: true }).click()
  await page.getByLabel('Memory Box (7 compartiments)').check()
  page.once('download', () => undefined)
  await page.getByRole('button', { name: 'Changer de planificateur' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Changer de planificateur' }).click()
  await expect(page.getByText(/Planificateur changé/)).toBeVisible()

  await page.getByRole('link', { name: 'Réviser ce paquet' }).click()
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await expect(page.getByRole('button', { name: /^Oublié/ })).toContainText('→ C1 · maintenant')
  await expect(page.getByRole('button', { name: /^Réussi/ })).toContainText('→ C2 · dans 2 j')
  await expect(page.getByRole('button', { name: /^Sûr/ })).toBeVisible()
  await page.keyboard.press('2')
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  await expect(page.getByText('Cartes vues')).toBeVisible()
})

test('typed answers are compared and editing a card resumes the session', async ({ page }) => {
  await deckWithNotes(page, 'Villes', [
    ['Capitale de la France', 'Paris'],
    ['Capitale du Portugal', 'Lisbonne'],
  ])
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Villes', exact: true }).click()
  await page.getByLabel('Réponse tapée (comparaison caractère par caractère)').check()
  await page.getByRole('button', { name: 'Enregistrer' }).last().click()
  await expect(page.getByText('Paramètres enregistrés')).toBeVisible()

  await page.getByRole('link', { name: 'Réviser ce paquet' }).click()
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card).toContainText('Capitale de la France')
  const input = page.getByLabel('Tapez votre réponse')
  await expect(input).toBeFocused()
  await input.fill('  paris ')
  await input.press('Enter')
  await expect(page.getByText('Exact !')).toBeVisible()
  await page.getByRole('button', { name: /^Bien/ }).click()

  // Second card: edit it from the menu (the typed-answer field has the focus), save, and come
  // back to the same session.
  await expect(card).toContainText('Capitale du Portugal')
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.getByRole('button', { name: /^Modifier/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Modifier la note' })).toBeVisible()
  await page.getByLabel('Recto').fill('Capitale du Portugal (Europe)')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(card).toContainText('Capitale du Portugal (Europe)')
  await expect(page.getByText('1 nouvelle', { exact: true })).toBeVisible()
})
