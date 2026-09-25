import { expect, test } from './fixtures'

test('the web app manifest is served with name and icons', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const manifest = (await res.json()) as { name: string; icons: { src: string }[] }
  expect(manifest.name).toBe('Recto')
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3)
  for (const icon of manifest.icons) expect((await request.get(`/${icon.src}`)).ok()).toBe(true)
})

test('the service worker becomes ready and the app loads offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // The first visit is not controlled yet; reload so the SW serves the page.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page).toHaveTitle('Recto')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await context.setOffline(false)
})
