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
