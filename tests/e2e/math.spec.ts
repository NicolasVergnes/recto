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

  // An invalid formula keeps its source, marked as such, with its message as text too.
  await page.getByLabel('Recto').fill('Erreur : \\(\\frac{1\\)')
  const error = preview.locator('.math-error')
  await expect(error).toHaveText('\\(\\frac{1\\) (Formule LaTeX invalide)')
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

// M10: Anki's `[$] … [/$]` and `[$$] … [/$$]` are formulas too, and the editor explains the syntax.
test('Anki formulas render in the preview, in review and in tiles, and the editor explains the syntax', async ({
  page,
}) => {
  await page.goto('/')
  await newNoteForm(page)
  const preview = page.getByRole('region', { name: /^Aperçu/ })

  // The help is a collapsed line under the fields, opened from the keyboard.
  const help = page.getByText('Écrire une formule (LaTeX)')
  await expect(help).toBeVisible()
  await expect(page.getByText('L’aperçu affiche le résultat.')).toBeHidden()
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/^Dans le texte/)).toContainText('\\(x^2\\)')
  await expect(page.getByText(/^En bloc/)).toContainText('\\[\\frac{1}{2}\\]')
  await expect(page.getByText(/^Syntaxes d’Anki/)).toContainText(
    '[$]x^2[/$] et [$$]\\frac{1}{2}[/$$]',
  )
  await expect(page.getByText('L’aperçu affiche le résultat.')).toBeVisible()

  await page.getByLabel('Recto').fill('Développer [$$]\\frac{1}{2} \\times 2x \\times x[/$$]')
  await page.getByLabel('Verso', { exact: true }).fill('[$]x^2[/$]')
  await expect(preview.locator('.katex-display .mfrac')).toBeVisible()
  await expect(preview.locator('.katex')).toHaveCount(2)
  await expect(preview.locator('.katex-mathml math')).toHaveCount(2)
  await expect(preview.locator('annotation').last()).toHaveText('x^2')
  await expect(preview.locator('span.math:not(:has(.katex))')).toHaveCount(0)
  // An invalid one stays as typed, delimiters included, with its message as text too.
  await page.getByLabel('Extra', { exact: true }).fill('[$]\\frac{1[/$]')
  const error = preview.locator('.math-error')
  await expect(error).toHaveText('[$]\\frac{1[/$] (Formule LaTeX invalide)')
  await expect(error).toHaveAttribute('title', 'Formule LaTeX invalide')
  // [latex] is text-mode LaTeX: it stays as written.
  await page.getByLabel('Extra', { exact: true }).fill('[latex]\\LaTeX[/latex]')
  await expect(preview).toContainText('[latex]\\LaTeX[/latex]')
  await expect(preview.locator('.katex')).toHaveCount(2)
  await page.getByRole('button', { name: 'Ajouter et fermer' }).click()
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()

  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card.locator('.katex-display .mfrac')).toBeVisible()
  // P1: the answer formula is not in the page before it is asked for.
  await expect(card.locator('.katex')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(card.locator('.katex')).toHaveCount(2)
  await expect(card.locator('annotation').last()).toHaveText('x^2')
  await expect(card.locator('span.math:not(:has(.katex))')).toHaveCount(0)
  await expect(card).toContainText('[latex]\\LaTeX[/latex]')

  // The mosaic renders them as well.
  await page.goto('/#/cards')
  await page.getByRole('radio', { name: 'Mosaïque recto-verso', exact: true }).check()
  const tiles = page.getByRole('list', { name: 'Mosaïque des cartes' })
  await expect(tiles.locator('.katex-display .mfrac')).toBeVisible()
  await expect(tiles.locator('.katex')).toHaveCount(2)
  await expect(tiles.locator('span.math:not(:has(.katex))')).toHaveCount(0)
})

test('a typed answer repeats an Anki formula without its delimiters', async ({ page }) => {
  await page.goto('/')
  await newNoteForm(page)
  await page.getByLabel('Recto').fill('Dérivée de [$]x^2[/$]')
  await page.getByLabel('Verso', { exact: true }).fill('[$]2x[/$]')
  await page.getByRole('button', { name: 'Ajouter et fermer' }).click()
  await page.getByLabel('Réponse tapée (comparaison caractère par caractère)').check()
  await page.getByRole('button', { name: 'Enregistrer' }).last().click()
  await expect(page.getByText('Paramètres enregistrés')).toBeVisible()

  await page.getByRole('link', { name: 'Réviser ce paquet' }).click()
  const input = page.getByLabel('Tapez votre réponse')
  await expect(page.getByRole('article', { name: 'Carte' }).locator('.katex')).toHaveCount(1)
  await input.fill('2x')
  await input.press('Enter')
  await expect(page.getByText('Exact !')).toBeVisible()
})

test('a wide formula scrolls on its own, never the page', async ({ page }) => {
  const terms = Array.from({ length: 30 }, (_, i) => `a_{${i + 1}}`).join('+')
  const noPageScroll = () =>
    expect
      .poll(() =>
        page.evaluate(() => {
          const { scrollWidth, clientWidth } = document.documentElement
          return scrollWidth - clientWidth
        }),
      )
      .toBe(0)
  const formulaScrolls = (selector: string) =>
    expect
      .poll(() =>
        page
          .locator(selector)
          .evaluateAll((els) => els.every((e) => e.scrollWidth > e.clientWidth)),
      )
      .toBe(true)

  await page.goto('/')
  await newNoteForm(page)
  // Inline, a single unbreakable fraction; display, a long sum.
  await page.getByLabel('Recto').fill(`Somme : \\(\\frac{${terms}}{n}\\) fin.`)
  await page.getByLabel('Verso', { exact: true }).fill(`\\[${terms}\\]`)
  const preview = page.getByRole('region', { name: /^Aperçu/ })
  await expect(preview.locator('.katex')).toHaveCount(2)
  await formulaScrolls('.card-content .math > .katex, .card-content .katex-display')
  await noPageScroll()
  await page.getByRole('button', { name: 'Ajouter et fermer' }).click()
  await expect(page.getByText('1 carte', { exact: true })).toBeVisible()

  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card.locator('.katex')).toHaveCount(1)
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await expect(card.locator('.katex')).toHaveCount(2)
  await formulaScrolls('.card-content .math > .katex, .card-content .katex-display')
  await noPageScroll()
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
