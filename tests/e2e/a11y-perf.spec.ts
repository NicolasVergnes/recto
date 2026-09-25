import { expect, test } from './fixtures'

test('a whole review can be done with the keyboard only', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByText('101 cartes')).toBeVisible()
  await page.goto('/#/')
  const review = page.getByRole('link', { name: 'Réviser aujourd’hui' })
  await expect(review).toBeVisible()
  for (let i = 0; i < 20 && !(await review.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(review).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Afficher la réponse' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Encore/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /^Bien/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Afficher la réponse' })).toBeFocused()
  await expect(page.getByText('1 en apprentissage')).toBeVisible()
})

test('respects prefers-reduced-motion and shows a visible focus ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Créer un paquet' })
  expect(await button.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus-visible')
  await expect(focused).toHaveCount(1)
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
})

test('the daily queue of 20 000 cards opens quickly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one measurement is enough')
  // Seeding 40 000 rows through IndexedDB takes 25–40 s in headless Chromium.
  test.setTimeout(180_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Charge')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Charge' })).toBeVisible()
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('recto')
      req.onsuccess = () => resolve(req.result)
    })
    const deck = await new Promise<{ id: string }>((resolve) => {
      const req = db.transaction('decks').objectStore('decks').getAll()
      req.onsuccess = () => resolve((req.result as { id: string }[])[0] ?? { id: '' })
    })
    const now = Date.now()
    const DAY = 86_400_000
    const note = (i: number) => ({
      id: `n${i}`,
      deckId: deck.id,
      modelType: 'basic',
      fields: [`Q${i}`, `A${i}`, ''],
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    const card = (i: number) => {
      const review = i % 4 !== 0
      return {
        id: `c${i}`,
        noteId: `n${i}`,
        deckId: deck.id,
        ord: 0,
        due: review ? now + ((i % 90) - 30) * DAY : now - i,
        state: review ? 2 : 0,
        reps: review ? 3 : 0,
        lapses: 0,
        lastReview: review ? now - 40 * DAY : null,
        suspended: false,
        retired: false,
        flag: 0,
        stability: review ? 1 + (i % 50) : 0,
        difficulty: review ? 5 : 0,
        scheduledDays: review ? 10 : 0,
        learningSteps: 0,
        box: 0,
        sideFlipped: false,
        createdAt: now - i,
      }
    }
    const tx = db.transaction(['notes', 'cards'], 'readwrite', { durability: 'relaxed' })
    for (let i = 0; i < 20_000; i++) {
      tx.objectStore('notes').put(note(i))
      tx.objectStore('cards').put(card(i))
    }
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()
  })
  const start = Date.now()
  await page.goto('/#/review')
  await expect(page.getByRole('article', { name: 'Carte' })).toBeVisible()
  const elapsed = Date.now() - start
  testInfo.annotations.push({ type: 'queue-20k-ms', description: String(elapsed) })
  await expect(page.getByText('200 révisions')).toBeVisible()
  expect(elapsed).toBeLessThan(2000)
})
