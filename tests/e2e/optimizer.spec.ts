import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function createDeck(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** FSRS parameters stored for the first deck, read straight from IndexedDB. */
function storedParams(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('recto')
      req.onsuccess = () => resolve(req.result)
    })
    const decks = await new Promise<{ settings: { fsrs: { params: unknown } } }[]>((resolve) => {
      const req = db.transaction('decks').objectStore('decks').getAll()
      req.onsuccess = () => resolve(req.result as { settings: { fsrs: { params: unknown } } }[])
    })
    db.close()
    return decks[0]?.settings.fsrs.params
  })
}

test('optimizes the FSRS parameters of a deck with 1 000+ reviews', async ({ page }) => {
  test.setTimeout(120_000)
  await createDeck(page, 'Optimisation')
  // 240 cards × 6 answers, spread over the last year; the learner forgets quickly.
  const total = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('recto')
      req.onsuccess = () => resolve(req.result)
    })
    const deck = await new Promise<{ id: string }>((resolve) => {
      const req = db.transaction('decks').objectStore('decks').getAll()
      req.onsuccess = () => resolve((req.result as { id: string }[])[0] ?? { id: '' })
    })
    const DAY = 86_400_000
    const now = Date.now()
    let seed = 42
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648
    const tx = db.transaction(['notes', 'cards', 'reviews'], 'readwrite')
    let count = 0
    for (let i = 0; i < 240; i++) {
      const start = now - (360 - (i % 60)) * DAY
      tx.objectStore('notes').put({
        id: `n${i}`,
        deckId: deck.id,
        modelType: 'basic',
        fields: [`Q${i}`, `A${i}`, ''],
        tags: [],
        createdAt: start,
        updatedAt: start,
      })
      let at = start
      let state = 0
      for (const delay of [0, 1, 3, 7, 15, 30]) {
        at += delay * DAY
        const rating = delay === 0 ? 3 : random() < Math.exp(-delay / 12) ? 3 : 1
        tx.objectStore('reviews').put({
          id: `r${i}-${delay}`,
          cardId: `c${i}`,
          deckId: deck.id,
          reviewedAt: at,
          rating,
          scheduler: 'fsrs',
          durationMs: 4000,
          stateBefore: state,
          dueBefore: at,
          stabilityBefore: 0,
          difficultyBefore: 0,
          boxBefore: 0,
          learningStepsBefore: 0,
          lastReviewBefore: null,
          stateAfter: 2,
          dueAfter: at + DAY,
          scheduledDays: 1,
          elapsedDays: delay,
          boxAfter: 0,
        })
        state = 2
        count++
      }
      tx.objectStore('cards').put({
        id: `c${i}`,
        noteId: `n${i}`,
        deckId: deck.id,
        ord: 0,
        due: now + 5 * DAY,
        state: 2,
        reps: 6,
        lapses: 0,
        lastReview: at,
        suspended: false,
        retired: false,
        flag: 0,
        stability: 10,
        difficulty: 5,
        scheduledDays: 10,
        learningSteps: 0,
        box: 0,
        sideFlipped: false,
        createdAt: start,
      })
    }
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()
    return count
  })
  expect(total).toBe(1440)
  await page.reload()

  await expect(page.getByText('Paramètres par défaut', { exact: true })).toBeVisible()
  await expect(page.getByText('1 440 révisions dans ce paquet.')).toBeVisible()
  await page.getByRole('button', { name: 'Optimiser' }).click()
  // The real fsrs-browser WASM runs in a worker.
  const table = page.getByRole('table', { name: 'Comparaison sur vos révisions passées' })
  await expect(table).toBeVisible({ timeout: 60_000 })
  await expect(table.getByRole('rowheader', { name: 'Erreur du modèle' })).toBeVisible()
  await expect(
    page.getByText('Les paramètres proposés décrivent mieux votre mémoire.'),
  ).toBeVisible()
  await page.getByText('Voir les 21 valeurs').click()
  await expect(page.getByRole('definition')).toHaveCount(2)

  await page.getByRole('button', { name: 'Appliquer' }).click()
  await expect(page.getByText('Nouveaux paramètres appliqués')).toBeVisible()
  await expect(page.getByText('Paramètres personnalisés', { exact: true })).toBeVisible()
  await expect(table).toBeHidden()
  const params = await storedParams(page)
  expect(Array.isArray(params) && params.length === 21 && params.every(Number.isFinite)).toBe(true)

  // Saving the form afterwards keeps the new parameters.
  await page.getByRole('button', { name: 'Enregistrer' }).last().click()
  await expect(page.getByText('Paramètres enregistrés')).toBeVisible()
  expect(await storedParams(page)).toEqual(params)

  await page.getByRole('button', { name: 'Revenir aux paramètres par défaut' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Revenir aux paramètres par défaut' })
    .click()
  await expect(page.getByText('Paramètres par défaut rétablis')).toBeVisible()
  await expect(page.getByText('Paramètres par défaut', { exact: true })).toBeVisible()
  expect(await storedParams(page)).toBeNull()
})

test('a deck with few reviews explains the threshold', async ({ page }) => {
  await createDeck(page, 'Petit paquet')
  await expect(
    page.getByText('Optimisation possible à partir de 1 000 révisions (0 actuellement).'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Optimiser' })).toHaveCount(0)
})
