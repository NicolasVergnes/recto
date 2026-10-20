import { expect, test } from './fixtures'

test('the home page is displayed', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Recto')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
})

test('the hash router shows each screen', async ({ page }) => {
  await page.goto('/#/stats')
  await expect(page.getByRole('heading', { level: 1, name: 'Statistiques' })).toBeVisible()
  await page.goto('/#/nowhere')
  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
})

test('the text size slider applies while it moves, not only when released', async ({ page }) => {
  await page.goto('/#/settings')
  const slider = page.getByRole('slider', { name: /^Taille du texte des cartes/ })
  // Only `input` (the thumb moving), no `change` (the thumb released).
  await slider.evaluate((el: HTMLInputElement) => {
    el.value = '1.2'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.getByText(/^Taille du texte des cartes\s:\s120/)).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-scale')),
  ).toBe('1.2')
})
