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

const grid = (page: Page) => page.getByRole('list', { name: 'Mosaïque des cartes' })

/** Faces whose content is taller than the face (a tile face never scrolls). */
const overflowing = (faces: Element[]) =>
  faces.filter((f) => f.scrollHeight > f.clientHeight + 1).length

/** A 900 × 1 600 PNG drawn by the browser (resized to 720 × 1 280 when added). */
function tallPng(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 1600
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#0e6f66'
      ctx.fillRect(0, 0, 900, 1600)
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  })
}

// A preference is shown at once and written to IndexedDB afterwards: wait for the write
// before a reload, or the reload may read the previous value.
async function savedSetting(page: Page, key: string, value: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open('recto')
            open.onerror = () => reject(new Error('open failed'))
            open.onsuccess = () => {
              const db = open.result
              const req = db.transaction('settings').objectStore('settings').get(key)
              req.onsuccess = () => {
                db.close()
                resolve((req.result as { value: unknown } | undefined)?.value)
              }
            }
          }),
        key,
      ),
    )
    .toBe(value)
}

test('mosaic: tiles render the card HTML, flip on demand, sort, select and persist', async ({
  page,
}, testInfo) => {
  await deckWithNotes(page, 'Mosaïque', [
    ['<b>Capitale</b> de la France', 'Paris'],
    ['Chien', 'Dog'],
    ['Zèbre', 'Zebra'],
    ['Longue question ' + 'lorem ipsum dolor sit amet '.repeat(40), 'Ligne<br>'.repeat(40)],
  ])
  await page.goto('/#/cards')
  // The table stays the default view.
  await expect(page.getByRole('table', { name: 'Cartes' })).toBeVisible()
  await page.getByRole('radio', { name: 'Mosaïque', exact: true }).check()
  await expect(grid(page)).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)

  // One face, real HTML; the answer is not in the DOM before the first flip.
  const tile = grid(page).getByRole('listitem').filter({ hasText: 'Capitale' })
  await expect(tile.locator('b')).toHaveText('Capitale')
  await expect(tile).toHaveAttribute('data-flipped', 'false')
  await expect(tile.getByText('Paris')).toHaveCount(0)
  const flip = tile.getByRole('button', { name: 'Retourner' })
  await flip.click()
  await expect(tile).toHaveAttribute('data-flipped', 'true')
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
  await expect(tile.getByText('Paris')).toBeVisible()
  // The hidden face is inert, and not painted: no mirrored question through the answer.
  await expect(tile.locator('.face.front')).toHaveAttribute('inert', '')
  await expect(tile.locator('.face.front')).toBeHidden()
  // A click on the face flips it back.
  await tile.locator('.faces').click({ position: { x: 10, y: 10 } })
  await expect(tile).toHaveAttribute('data-flipped', 'false')

  // Keyboard: Tab reaches « Retourner », Enter flips, the focus stays on the button.
  await tile.getByRole('checkbox').focus()
  await page.keyboard.press('Tab')
  await expect(flip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tile).toHaveAttribute('data-flipped', 'true')
  await expect(flip).toBeFocused()
  await page.keyboard.press('Space')
  await expect(tile).toHaveAttribute('data-flipped', 'false')

  // Columns: 1 on a phone, at least 3 on the desktop project (1 280 px wide).
  const perRow = () => grid(page).locator('.grid-row').first().getByRole('listitem').count()
  if (testInfo.project.name === 'mobile') expect(await perRow()).toBe(1)
  else expect(await perRow()).toBeGreaterThanOrEqual(3)
  // Small tiles: two on a phone, more on the desktop; the size is remembered.
  const medium = await perRow()
  await page.getByLabel('Taille').selectOption({ label: 'Petites' })
  await expect.poll(perRow).toBeGreaterThan(medium)
  if (testInfo.project.name === 'mobile') expect(await perRow()).toBe(2)
  await savedSetting(page, 'tileSize', 'small')

  // Selection and bulk actions work from a tile.
  await tile.getByRole('checkbox', { name: /Sélectionner « Capitale/ }).check()
  await expect(page.getByText('1 sélectionnée')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Actions sur la sélection' })).toBeVisible()
  await page.getByRole('button', { name: 'Désélectionner' }).click()

  // Sorting from the mosaic bar.
  await page.getByLabel('Trier par').selectOption({ label: 'Question' })
  await page.getByLabel('Ordre').selectOption({ label: 'Décroissant' })
  await expect(grid(page).getByRole('listitem').first()).toContainText('Zèbre')
  await page.getByLabel('Ordre').selectOption({ label: 'Croissant' })
  await expect(grid(page).getByRole('listitem').first()).toContainText('Capitale')

  // The view is remembered.
  await savedSetting(page, 'browserView', 'flip')
  await page.reload()
  await expect(grid(page)).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Mosaïque', exact: true })).toBeChecked()
  await expect(page.getByLabel('Taille')).toHaveValue('small')
  await page.getByLabel('Taille').selectOption({ label: 'Moyennes' })

  // Both faces side by side: no flip button, both texts visible.
  await page.getByRole('radio', { name: 'Mosaïque recto-verso' }).check()
  const both = grid(page).getByRole('listitem').filter({ hasText: 'Capitale' })
  await expect(both.locator('b')).toBeVisible()
  await expect(both.getByText('Paris')).toBeVisible()
  await expect(both.getByRole('button', { name: 'Retourner' })).toHaveCount(0)
  await expect(both.getByRole('link', { name: 'Modifier' })).toBeVisible()
  // A long card never grows past its row: its content shrinks until it fits, no scrollbar.
  // Only the rows in view are rendered (one tall tile per row on a phone): search for it.
  await page.getByLabel('Rechercher').fill('Longue')
  const long = grid(page).getByRole('listitem').filter({ hasText: 'Longue question' })
  await expect(long).toBeVisible()
  const sizes = await long.evaluate((el) => ({
    tile: el.getBoundingClientRect().height,
    row: el.parentElement?.getBoundingClientRect().height ?? 0,
    stacked: !!el.querySelector('.both.stacked'),
  }))
  expect(sizes.tile).toBeLessThan(sizes.row)
  expect(sizes.stacked).toBe(testInfo.project.name === 'mobile')
  await expect.poll(() => long.locator('.side').evaluateAll(overflowing)).toBe(0)

  // Back to the table.
  await page.getByLabel('Rechercher').fill('')
  await page.getByRole('radio', { name: 'Liste', exact: true }).check()
  await expect(page.getByRole('row')).toHaveCount(5)
})

test('mosaic: cards fit their tile, centred, a large image shrinking first', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByText('101 cartes')).toBeVisible()
  // A tall map with a question, as in the Anki « départements » deck.
  await page.goto('/#/notes/new')
  await page.getByLabel('Recto').fill('Quel est ce département ? ')
  await page.locator('input[type=file][accept^="image"]').setInputFiles({
    name: 'carte.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await tallPng(page), 'base64'),
  })
  await expect(page.locator('.preview img').first()).toHaveAttribute('src', /^blob:/)
  await page.getByLabel('Verso', { exact: true }).fill('Ain')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByLabel('Recto')).toHaveValue('')

  await page.goto('/#/cards')
  for (const view of ['Mosaïque', 'Mosaïque recto-verso']) {
    await page.getByRole('radio', { name: view, exact: true }).check()
    await page.getByLabel('Ordre').selectOption({ label: 'Décroissant' })
    for (const size of ['Petites', 'Moyennes', 'Grandes']) {
      await page.getByLabel('Taille').selectOption({ label: size })
      const map = grid(page).getByRole('listitem').filter({ hasText: 'Quel est ce département' })
      await expect(map.locator('img')).toHaveAttribute('src', /^blob:/)
      await expect.poll(() => grid(page).locator('.side').evaluateAll(overflowing)).toBe(0)
      // The image gave way to the text: the question keeps its full size.
      const front = map.locator('.side').first()
      await expect
        .poll(() => front.locator('.fit').evaluate((el) => el.style.zoom || '1'))
        .toBe('1')
      await expect(front).toHaveCSS('text-align', 'center')
    }
  }
})

test('editor preview: question and answer in two faces of the same size', async ({ page }) => {
  await deckWithNotes(page, 'Aperçu', [])
  await page.getByLabel('Recto').fill('Capitale de la France')
  await page.getByLabel('Verso', { exact: true }).fill('Paris ' + 'et sa région '.repeat(30))
  const faces = page.getByRole('region', { name: /^Aperçu/ }).locator('.face')
  await expect(faces).toHaveCount(2)
  const [a, b] = await Promise.all([faces.nth(0).boundingBox(), faces.nth(1).boundingBox()])
  expect(a && b && Math.round(a.width) === Math.round(b.width)).toBe(true)
  expect(a && b && Math.round(a.height) === Math.round(b.height)).toBe(true)
  await expect(faces.nth(0).locator('.side')).toHaveCSS('text-align', 'center')
  await expect.poll(() => faces.locator('.side').evaluateAll(overflowing)).toBe(0)
})

test('move: a new deck is created from the move dialog', async ({ page }) => {
  await deckWithNotes(page, 'Départ', [['Chien', 'Dog']])
  await page.goto('/#/cards')
  await page.getByRole('radio', { name: 'Liste', exact: true }).check()
  await page.getByRole('checkbox', { name: /Sélectionner « Chien/ }).check()
  await page.getByRole('button', { name: 'Déplacer' }).click()
  const move = page.getByRole('dialog', { name: 'Déplacer 1 note' })
  await move.getByRole('button', { name: 'Nouveau paquet' }).click()
  const create = page.getByRole('dialog', { name: 'Nouveau paquet' })
  await create.getByLabel('Nom').fill('Animaux')
  await create.getByRole('button', { name: 'Créer' }).click()
  await expect(create).toBeHidden()
  // The new deck is the destination, the move dialog is still open.
  await expect(move.getByLabel('Paquet')).toHaveValue(/.+/)
  await expect(move.getByLabel('Paquet').locator('option:checked')).toHaveText(/Animaux/)
  await move.getByRole('button', { name: 'Déplacer' }).click()
  await expect(page.getByText('Notes déplacées')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Chien' })).toContainText('Animaux')
})

test('on a small phone the mosaic stays above the bottom navigation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the navigation is at the bottom on phones only')
  await page.setViewportSize({ width: 412, height: 640 })
  await deckWithNotes(page, 'Petit écran', [['Chien', 'Dog']])
  await page.goto('/#/cards')
  await page.getByRole('radio', { name: 'Mosaïque', exact: true }).check()
  // The filters leave less room than the list needs: the page scrolls, the list ends above the nav.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const listBottom = await grid(page).evaluate((el) => el.getBoundingClientRect().bottom)
  const navTop = await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .evaluate((el) => el.getBoundingClientRect().top)
  expect(listBottom).toBeLessThanOrEqual(navTop)
  const flip = grid(page).getByRole('button', { name: 'Retourner' })
  await flip.click()
  await expect(flip).toHaveAttribute('aria-pressed', 'true')
})

test('mosaic: the flip style is chosen in Settings and reduced motion disables it', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Essayer avec un paquet d’exemple' }).click()
  await expect(page.getByText('101 cartes')).toBeVisible()
  await page.goto('/#/notes/new')
  await page.getByLabel('Type de carte').selectOption({ label: 'Texte à trous' })
  await page.getByLabel('Texte', { exact: true }).fill('La {{c1::Lune}} tourne autour de la Terre.')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée')).toBeVisible()

  await page.goto('/#/settings')
  await expect(page.getByRole('radio', { name: 'Rotation horizontale' })).toBeChecked()
  await page.getByRole('radio', { name: 'Sans animation' }).check()
  await savedSetting(page, 'flipStyle', 'none')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Sans animation' })).toBeChecked()

  await page.goto('/#/cards')
  await page.getByRole('radio', { name: 'Mosaïque', exact: true }).check()
  const faces = grid(page).locator('.faces').first()
  await expect(faces).toHaveAttribute('data-flip-style', 'none')

  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'Glissement' }).check()
  await page.goto('/#/cards')
  await expect(faces).toHaveAttribute('data-flip-style', 'slide')
  // Cloze cards render the gap on the front and the revealed text on the back.
  await page.getByLabel('Rechercher').fill('tourne')
  const cloze = grid(page).getByRole('listitem').filter({ hasText: 'autour' })
  await expect(cloze.locator('.cloze')).toContainText('[')
  await cloze.getByRole('button', { name: 'Retourner' }).click()
  await expect(cloze.locator('.face.back .cloze')).not.toContainText('[')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const duration = await faces
    .locator('.face')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(duration).toBe('0s')
})
