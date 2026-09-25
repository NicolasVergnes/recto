import { expect, test } from './fixtures'

// E2E 6 (06 §4): offline → the app loads, reviews and creates cards.
test('works offline after a first visit', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByText('101 cartes')).toBeVisible()

  await context.setOffline(true)
  await page.goto('/#/')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Réviser aujourd’hui' })).toBeVisible()
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await page.getByRole('button', { name: /^Bien/ }).click()
  await expect(page.getByText('1 en apprentissage')).toBeVisible()

  await page.goto('/#/notes/new')
  await page.getByLabel('Recto').fill('Hors ligne')
  await page.getByLabel('Verso', { exact: true }).fill('Ça marche')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (1 carte)')).toBeVisible()

  // The Anki reader (worker + sql.js WASM) is precached too.
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys()
    const urls: string[] = []
    for (const key of keys)
      for (const req of await (await caches.open(key)).keys()) urls.push(req.url)
    return urls
  })
  expect(cached.some((u) => u.endsWith('.wasm'))).toBe(true)
  expect(cached.some((u) => u.includes('apkg.worker'))).toBe(true)
  await context.setOffline(false)
})

test('the statistics screen reflects today’s reviews', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByText('101 cartes')).toBeVisible()
  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  for (const [i, key] of ['3', '1', '4'].entries()) {
    await expect(card).toContainText(`Département 0${i + 1}`)
    await page.keyboard.press('Space')
    await expect(card).toContainText('Préfecture')
    await page.keyboard.press(key)
  }
  await expect(card).toContainText('Département 04')
  await page.goto('/#/stats')
  await expect(page.getByRole('heading', { level: 1, name: 'Statistiques' })).toBeVisible()
  const done = page.locator('.tile', { hasText: 'Réponses aujourd’hui' })
  await expect(done).toContainText('3')
  await expect(page.locator('.tile', { hasText: 'Réussite aujourd’hui' })).toContainText('67')
  await expect(page.getByRole('slider', { name: /Cartes dues par jour/ })).toBeVisible()
  await expect(page.getByText(/3 révisions sur les 365 derniers jours/)).toBeVisible()
  // Keyboard exploration of the forecast.
  await page.getByRole('slider', { name: /Cartes dues par jour/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('slider', { name: /Cartes dues par jour/ })).toHaveAttribute(
    'aria-valuenow',
    '1',
  )
  const states = page.getByRole('table', { name: 'Cartes par état' })
  await expect(states.getByRole('row', { name: /Nouvelle/ })).toContainText('98')
  await expect(states.getByRole('row', { name: /Apprentissage/ })).toContainText('2')
})
