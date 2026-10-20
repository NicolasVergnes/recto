import type { CDPSession, Page } from '@playwright/test'
import { expect, test } from './fixtures'

type Point = { x: number; y: number }

/**
 * Real touch input through the browser's gesture pipeline (touch-action, pointercancel), as on a
 * phone: `page.mouse` would never meet them. Chromium only (CDP).
 */
async function drag(cdp: CDPSession, from: Point, to: Point) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= 8; i++) {
    const x = from.x + ((to.x - from.x) * i) / 8
    const y = from.y + ((to.y - from.y) * i) / 8
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function cardCenter(page: Page): Promise<Point> {
  const box = await page.getByRole('article', { name: 'Carte' }).boundingBox()
  if (!box) throw new Error('no card')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function touch(cdp: CDPSession, page: Page) {
  const c = await cardCenter(page)
  await drag(cdp, c, c)
}

async function swipe(cdp: CDPSession, page: Page, dx: number, dy = 0) {
  const c = await cardCenter(page)
  await drag(cdp, { x: c.x - dx / 2, y: c.y - dy / 2 }, { x: c.x + dx / 2, y: c.y + dy / 2 })
}

test('on a phone, touch the card to show the answer, swipe left for Again, right for Good', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium' || !testInfo.project.use.hasTouch, 'touch through CDP')
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Gestes')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  // Boîte de Leitner: Again brings the card back at once, Good sends it two days away.
  await page.getByLabel('Boîte de Leitner (7 compartiments)', { exact: true }).check()
  await page.getByRole('button', { name: 'Changer de planificateur' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Changer de planificateur' }).click()
  await expect(page.getByText(/Planificateur changé/)).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page.getByLabel('Recto').fill('Capitale de l’Italie')
  await page.getByLabel('Verso', { exact: true }).fill('Rome')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByLabel('Recto')).toHaveValue('')
  await page.goto('/#/settings')
  await page.getByRole('checkbox', { name: /^Gestes en révision/ }).check()

  await page.goto('/#/')
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  const cdp = await page.context().newCDPSession(page)
  const card = page.getByRole('article', { name: 'Carte' })
  const showAnswer = page.getByRole('button', { name: 'Afficher la réponse' })
  const good = page.getByRole('button', { name: /^Réussi/ })
  await expect(showAnswer).toBeVisible()
  await expect(page.getByText('Rome')).toHaveCount(0)

  // A vertical move on the hidden card is a scroll, not a touch; a touch shows the answer.
  await swipe(cdp, page, 0, 150)
  await expect(showAnswer).toBeVisible()
  await touch(cdp, page)
  await expect(card).toContainText('Rome')
  await expect(good).toBeVisible()

  // Too short or mostly vertical: nothing is rated.
  await swipe(cdp, page, 40)
  await swipe(cdp, page, 120, 200)
  await expect(good).toBeVisible()

  // Left: Again, the card comes back at once with its answer hidden.
  await swipe(cdp, page, -200)
  await expect(showAnswer).toBeVisible()
  await expect(card).toContainText('Capitale de l’Italie')
  await expect(page.getByText('Rome')).toHaveCount(0)

  // A slightly diagonal swipe on the hidden card shows the answer (it never rates unseen);
  // then right: Good, the session is over.
  await swipe(cdp, page, 200, 60)
  await expect(good).toBeVisible()
  await swipe(cdp, page, 200, 60)
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
})
