import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function createDeck(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** An 800 × 600 PNG drawn by the browser: a map with two coloured areas. */
async function mapPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#dfeee9'
      ctx.fillRect(0, 0, 800, 600)
      ctx.fillStyle = '#0e6f66'
      ctx.fillRect(100, 100, 200, 150)
      ctx.fillStyle = '#9c4f00'
      ctx.fillRect(500, 350, 200, 150)
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  })
  return Buffer.from(base64, 'base64')
}

test('image occlusion: draw and place masks, then review one card per mask', async ({ page }) => {
  await createDeck(page, 'Cartes')
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page.getByLabel('Type').selectOption({ label: 'Occlusion d’image' })
  await page.getByLabel('Choisir une image').setInputFiles({
    name: 'carte.png',
    mimeType: 'image/png',
    buffer: await mapPng(page),
  })

  // Pointer: drag a rectangle over the first area.
  const image = page.locator('.frame img')
  await expect(image).toHaveAttribute('src', /^blob:/)
  const box = await image.boundingBox()
  if (!box) throw new Error('image not laid out')
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.15)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 5 })
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Masque 1', exact: true })).toBeVisible()
  await page.getByLabel('Réponse (facultative)').first().fill('Émeraude')

  // Keyboard only: add a mask, move it with the arrows, grow it with Shift + arrows.
  await page.getByRole('button', { name: 'Ajouter un masque' }).click()
  const second = page.getByRole('button', { name: 'Masque 2', exact: true })
  await second.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.locator('.frame rect[data-index]')).toHaveCount(2)
  await expect(page.getByText('Cette note produira 2 cartes.')).toBeVisible()

  await page.getByLabel('En-tête').fill('Zones colorées')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (2 cartes)')).toBeVisible()

  // Browser: one row per mask group.
  await page.goto('/#/cards')
  await expect(page.getByText('Zones colorées #1')).toBeVisible()
  await expect(page.getByText('Zones colorées #2')).toBeVisible()

  // Review: the answer (label) is not in the DOM before the reveal (P1).
  await page.goto('/')
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card.locator('figure.occlusion img')).toHaveAttribute('src', /^blob:/)
  await expect(card.locator('rect')).toHaveCount(2)
  await expect(card.locator('rect.target')).toHaveCount(1)
  await expect(card.getByText('Émeraude')).toHaveCount(0)
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await expect(card.locator('rect.open')).toHaveCount(1)
  await expect(card.getByText('Émeraude')).toBeVisible()
})

test('image occlusion notes need an image and a mask', async ({ page }) => {
  await createDeck(page, 'Vide')
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page.getByLabel('Type').selectOption({ label: 'Occlusion d’image' })
  await expect(page.getByText('Aucune image : choisissez-en une.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toBeDisabled()
})
