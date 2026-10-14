import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

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
  await expect(card).toContainText('Capitale de l’')
  // New cards come in random order (M13): follow the one asked first.
  const italyFirst = ((await card.textContent()) ?? '').includes('Italie')
  const [first, answer, second] = italyFirst
    ? ['Capitale de l’Italie', 'Rome', 'Capitale de l’Espagne']
    : ['Capitale de l’Espagne', 'Madrid', 'Capitale de l’Italie']
  await expect(card).toContainText(first)
  // P1: the answer is not in the page before asking for it.
  await expect(page.getByText(answer)).toHaveCount(0)
  await expect(page.getByText('2 nouvelles')).toBeVisible()

  await page.keyboard.press('Space')
  await expect(card).toContainText(answer)
  const good = page.getByRole('button', { name: /^Bien/ })
  await expect(good).toContainText('10 min')
  await expect(page.getByRole('button', { name: /^Encore/ })).toBeFocused()
  await page.keyboard.press('3')

  await expect(card).toContainText(second)
  await expect(page.getByText('1 nouvelle', { exact: true })).toBeVisible()
  await expect(page.getByText('1 en apprentissage')).toBeVisible()

  await page.keyboard.press('Control+z')
  await expect(card).toContainText(first)
  await expect(page.getByText(answer)).toHaveCount(0)
  await expect(page.getByText('2 nouvelles')).toBeVisible()

  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await page.getByRole('button', { name: /^Facile/ }).click()
  await expect(card).toContainText(second)
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
  // No backup is downloaded before the conversion any more (M9).
  let downloads = 0
  page.on('download', () => downloads++)
  await page.getByRole('button', { name: 'Changer de planificateur' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Changer de planificateur' }).click()
  await expect(page.getByText(/Planificateur changé/)).toBeVisible()
  expect(downloads).toBe(0)
  // Box intervals stay editable; the booklet calendar is gone.
  await expect(page.getByLabel('Compartiment 1', { exact: true })).toHaveValue('1')
  await expect(page.getByText(/Calendrier du coffret/)).toHaveCount(0)

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
  await expect(card).toContainText('Capitale d')
  // New cards come in random order (M13): follow the one asked first.
  const franceFirst = ((await card.textContent()) ?? '').includes('France')
  const [typed, second] = franceFirst
    ? ['  paris ', 'Capitale du Portugal']
    : ['  lisbonne ', 'Capitale de la France']
  const input = page.getByLabel('Tapez votre réponse')
  await expect(input).toBeFocused()
  await input.fill(typed)
  await input.press('Enter')
  await expect(page.getByText('Exact !')).toBeVisible()
  await page.getByRole('button', { name: /^Bien/ }).click()

  // Second card: edit it from the menu (the typed-answer field has the focus), save, and come
  // back to the same session.
  await expect(card).toContainText(second)
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.getByRole('button', { name: /^Modifier/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Modifier la note' })).toBeVisible()
  await page.getByLabel('Recto').fill(`${second} (Europe)`)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(card).toContainText(`${second} (Europe)`)
  await expect(page.getByText('1 nouvelle', { exact: true })).toBeVisible()
})

// M11: one card for both sides, in FSRS decks too: a success turns it over, a failure does not.
test('an FSRS deck asks a basic card both ways, without a second card', async ({ page }) => {
  await page.clock.install()
  await deckWithNotes(page, 'Sens', [['Capitale de l’Italie', 'Rome']])
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Sens', exact: true }).click()
  await expect(
    page.getByLabel('Interroger dans les deux sens (la carte est retournée après chaque réussite)'),
  ).toBeChecked()

  await page.getByRole('link', { name: 'Réviser ce paquet' }).click()
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card).toContainText('Capitale de l’Italie')
  await expect(page.getByText('Sens inversé')).toHaveCount(0)
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await page.getByRole('button', { name: /^Bien/ }).click()

  // Back after its 10-minute learning step, turned over: Rome is now the question.
  await page.getByRole('button', { name: 'Attendre' }).click()
  await page.clock.fastForward('11:00')
  await expect(card).toContainText('Rome')
  await expect(card).not.toContainText('Capitale de l’Italie')
  await expect(page.getByText('Sens inversé')).toBeVisible()
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await expect(card).toContainText('Capitale de l’Italie')
})

// M13: the home screen counts notes and cards; new cards are random; no twin option any more.
test('the home screen counts notes and cards, and new decks draw cards at random', async ({
  page,
}) => {
  await deckWithNotes(page, 'Comptes', [
    ['Un', 'One'],
    ['Deux', 'Two'],
  ])
  await page.goto('/#/')
  await expect(page.getByText('2 notes · 2 cartes')).toBeVisible()
  await page.getByRole('link', { name: 'Comptes', exact: true }).click()
  await expect(page.getByLabel('Ordre des nouvelles cartes')).toHaveValue('random')
  await expect(page.getByText(/jumelles/)).toHaveCount(0)
})
