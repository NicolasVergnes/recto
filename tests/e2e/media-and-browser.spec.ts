import { expect, test, type Page } from '@playwright/test'

async function createDeck(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

test('images are resized to 1280 px, get an alt text and render from IndexedDB', async ({
  page,
}) => {
  await createDeck(page, 'Images')
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  // A 2 000 × 1 500 PNG drawn by the browser itself.
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2000
    canvas.height = 1500
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#0e6f66'
      ctx.fillRect(0, 0, 2000, 1500)
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  })
  await page.getByLabel('Recto').click()
  await page.locator('input[type=file][accept^="image"]').setInputFiles({
    name: 'grande carte.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  })
  const preview = page.locator('.preview img').first()
  await expect(preview).toHaveAttribute('src', /^blob:/)
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1280)
  await expect(page.getByLabel('Recto')).toHaveValue(
    /<img src="[0-9a-f]{8}-grande-carte\.(webp|jpg)" alt="">/,
  )

  await page.getByLabel('Texte alternatif').fill('Un rectangle vert')
  await page.getByLabel('Texte alternatif').blur()
  await expect(preview).toHaveAttribute('alt', 'Un rectangle vert')
  await page.getByLabel('Verso', { exact: true }).fill('Vert')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (1 carte)')).toBeVisible()
})

test('field HTML is sanitised and remote images are never fetched', async ({ page }) => {
  const remote: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('example.com')) remote.push(r.url())
  })
  await createDeck(page, 'Sécurité')
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page
    .getByLabel('Recto')
    .fill(
      '<b>gras</b><script>window.__pwned = 1</script><img src="https://example.com/x.png" onerror="window.__pwned = 2">',
    )
  await expect(page.locator('.preview b').first()).toHaveText('gras')
  await expect(page.getByAltText(/Image distante non chargée/).first()).toBeAttached()
  await page.waitForTimeout(300)
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined()
  expect(remote).toEqual([])
})

test('the card browser is virtualised with 5 000 cards', async ({ page }) => {
  await createDeck(page, 'Gros paquet')
  // Seed 5 000 notes/cards straight into IndexedDB (same shapes as the app writes).
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('recto')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(new Error('open failed'))
    })
    const deck = await new Promise<{ id: string }>((resolve) => {
      const req = db.transaction('decks').objectStore('decks').getAll()
      req.onsuccess = () => resolve((req.result as { id: string }[])[0] ?? { id: '' })
    })
    const tx = db.transaction(['notes', 'cards'], 'readwrite')
    const now = Date.now()
    for (let i = 0; i < 5000; i++) {
      const noteId = `n${i}`
      tx.objectStore('notes').put({
        id: noteId,
        deckId: deck.id,
        modelType: 'basic',
        fields: [`Question ${i}`, `Réponse ${i}`, ''],
        tags: [],
        createdAt: now + i,
        updatedAt: now + i,
      })
      tx.objectStore('cards').put({
        id: `c${i}`,
        noteId,
        deckId: deck.id,
        ord: 0,
        due: now + i,
        state: 0,
        reps: 0,
        lapses: 0,
        lastReview: null,
        suspended: false,
        retired: false,
        flag: 0,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        learningSteps: 0,
        box: 0,
        sideFlipped: false,
        createdAt: now + i,
      })
    }
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()
  })
  await page.goto('/#/cards')
  await expect(page.getByText(/5\s000 cartes/)).toBeVisible()
  const rendered = await page.getByRole('row').count()
  expect(rendered).toBeGreaterThan(5)
  expect(rendered).toBeLessThan(80)
  await page.getByLabel('Rechercher').fill('Question 4321')
  await expect(page.getByRole('link', { name: 'Question 4321' })).toBeVisible()
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()
})

test('settings show the storage state after the first card', async ({ page }) => {
  await createDeck(page, 'Stockage')
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page.getByLabel('Recto').fill('Q')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (1 carte)')).toBeVisible()
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Stockage' })).toBeVisible()
  await expect(page.getByText(/utilisés sur/)).toBeVisible()
  await expect(page.getByText(/Stockage (non )?persistant/)).toBeVisible()
})
