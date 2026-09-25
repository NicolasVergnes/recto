import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// SPEC §5.2: `\( … \)` and `\[ … \]` rendered by KaTeX (ADR-009), loaded on demand.
const FRONT = 'Développer \\[\\frac{1}{2} \\times 2x \\times x\\]'
const BACK = '\\(x^2\\)'

async function newNoteForm(page: Page) {
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Maths')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Maths' })).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nouvelle note' })).toBeVisible()
}

test('formulas render in the editor preview and in review', async ({ page }) => {
  await page.goto('/')
  await newNoteForm(page)
  const preview = page.getByRole('region', { name: /^Aperçu/ })

  // An invalid formula keeps its source, marked as such.
  await page.getByLabel('Recto').fill('Erreur : \\(\\frac{1\\)')
  const error = preview.locator('.math-error')
  await expect(error).toHaveText('\\(\\frac{1\\)')
  await expect(error).toHaveAttribute('title', 'Formule LaTeX invalide')

  await page.getByLabel('Recto').fill(FRONT)
  await page.getByLabel('Verso', { exact: true }).fill(BACK)
  await expect(preview.locator('.katex-display .mfrac')).toBeVisible()
  await expect(preview.locator('.katex')).toHaveCount(2)
  await expect(preview.locator('.katex-mathml math')).toHaveCount(2)
  await expect(preview.locator('span.math:not(:has(.katex))')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajouter et fermer' }).click()
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()

  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card.locator('.katex-display .mfrac')).toBeVisible()
  // P1: the answer formula is not in the page before it is asked for.
  await expect(card.locator('.katex')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(card.locator('.katex')).toHaveCount(2)
  await expect(card.locator('.katex-mathml math')).toHaveCount(2)
  await expect(card.locator('annotation').last()).toHaveText('x^2')
  await expect(card.locator('span.math:not(:has(.katex))')).toHaveCount(0)
})

test('formulas render offline after a first visit', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  // KaTeX was never loaded online: its chunk, stylesheet and fonts come from the precache.
  await context.setOffline(true)
  await page.reload()
  await newNoteForm(page)
  await page.getByLabel('Recto').fill(FRONT)
  await page.getByLabel('Verso', { exact: true }).fill(BACK)
  const preview = page.getByRole('region', { name: /^Aperçu/ })
  await expect(preview.locator('.katex-display .mfrac')).toBeVisible()
  await expect(preview.locator('.katex')).toHaveCount(2)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready
        return [...document.fonts].some((f) => f.family.includes('KaTeX') && f.status === 'loaded')
      }),
    )
    .toBe(true)
  await context.setOffline(false)
})
