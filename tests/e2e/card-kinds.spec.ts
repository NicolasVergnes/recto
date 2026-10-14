import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** An 800 × 600 PNG drawn by the browser. */
async function mapPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#dfeee9'
      ctx.fillRect(0, 0, 800, 600)
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  })
  return Buffer.from(base64, 'base64')
}

async function renameField(page: Page, n: number, name: string) {
  await page.getByLabel(`Nom du champ ${n}`).fill(name)
  await page.getByLabel(`Nom du champ ${n}`).blur()
}

test('a note type mixes an occlusion, two classic cards and a cloze (M14)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Monde')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Monde' })).toBeVisible()

  // The type: Basique is listed as built in, the new one gets a kind of card per card.
  await page.goto('/#/note-types')
  await expect(page.getByText('Intégré : une carte, au choix classique')).toBeVisible()
  await page.getByRole('button', { name: 'Nouveau type' }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Mixte')
  await renameField(page, 1, 'Carte')
  await renameField(page, 2, 'Pays')
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await renameField(page, 3, 'Capitale')
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await renameField(page, 4, 'Phrase')
  const kinds = page.getByLabel('Type de carte')
  await kinds.first().selectOption({ label: 'Occlusion d’image' })
  await expect(page.getByLabel('Champ de l’image')).toHaveValue('Carte')
  await page.getByRole('button', { name: 'Ajouter une carte' }).click()
  await page.getByLabel('Recto (question)').nth(0).fill('Capitale de {{Pays}} ?')
  await page.getByLabel('Verso (réponse)').nth(0).fill('{{FrontSide}}<hr id=answer>{{Capitale}}')
  await page.getByRole('button', { name: 'Ajouter une carte' }).click()
  await page.getByLabel('Recto (question)').nth(1).fill('{{Capitale}} est la capitale de ?')
  await page.getByLabel('Verso (réponse)').nth(1).fill('{{FrontSide}}<hr id=answer>{{Pays}}')
  await page.getByRole('button', { name: 'Ajouter une carte' }).click()
  await kinds.nth(3).selectOption({ label: 'Texte à trous' })
  await page.getByLabel('Champ du texte').selectOption('Phrase')
  // The source of a card cannot be removed.
  await page.getByRole('button', { name: 'Retirer le champ « Phrase »' }).click()
  await expect(page.getByLabel('Nom du champ 4')).toHaveValue('Phrase')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()

  // A note: the image field is drawn on, the cloze field gets its holes from the button.
  await page.goto('/#/notes/new')
  await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Mixte' })
  await expect(page.getByLabel('Type de carte')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Carte', exact: true })).toBeVisible()
  await page.getByLabel('Choisir une image').setInputFiles({
    name: 'carte.png',
    mimeType: 'image/png',
    buffer: await mapPng(page),
  })
  await expect(page.locator('.frame img')).toHaveAttribute('src', /^blob:/)
  await page.getByRole('button', { name: 'Ajouter un masque' }).click()
  await page.getByRole('button', { name: 'Ajouter un masque' }).click()
  await expect(page.getByRole('button', { name: 'Masque 2 · carte 2' })).toBeVisible()
  await page.getByLabel('Pays', { exact: true }).fill('France')
  await page.getByLabel('Capitale', { exact: true }).fill('Paris')
  const phrase = page.getByLabel('Phrase', { exact: true })
  await phrase.fill('Paris est sur la Seine')
  await phrase.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 5))
  await page.getByRole('button', { name: 'Créer un trou' }).click()
  await phrase.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(25, 30))
  await page.keyboard.press('Control+Shift+C')
  await expect(phrase).toHaveValue('{{c1::Paris}} est sur la {{c2::Seine}}')
  await expect(page.getByText('Cette note produira 6 cartes.')).toBeVisible()
  const preview = page.getByRole('region', { name: /^Aperçu/ })
  await expect(preview.locator('.preview')).toHaveCount(6)
  await expect(preview.getByText('Carte 4 · 2')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (6 cartes)')).toBeVisible()

  // Review: every kind of card is asked, in any order (M13).
  await page.goto('/')
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  const card = page.getByRole('article', { name: 'Carte' })
  const seen = { occlusion: 0, cloze: 0, classic: 0 }
  for (let i = 0; i < 6; i++) {
    await expect(page.getByRole('button', { name: 'Afficher la réponse' })).toBeVisible()
    if ((await card.locator('figure.occlusion').count()) > 0) seen.occlusion++
    else if ((await card.locator('.cloze').count()) > 0) seen.cloze++
    else seen.classic++
    await page.getByRole('button', { name: 'Afficher la réponse' }).click()
    await page.keyboard.press('4')
  }
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()
  expect(seen).toEqual({ occlusion: 2, cloze: 2, classic: 2 })
})

test('a Basique cloze note can ask every hole on one card (M14)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Phrases')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page.getByLabel('Type de carte').selectOption({ label: 'Texte à trous' })
  await page.getByLabel('Texte', { exact: true }).fill('La {{c1::Lune}} et la {{c2::Terre}}.')
  await page.getByLabel('Génère une seule carte').check()
  await expect(page.getByText('Cette note produira 1 carte.')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (1 carte)')).toBeVisible()

  await page.goto('/')
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card.locator('.cloze')).toHaveCount(2)
  await expect(card.getByText(/Lune|Terre/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await expect(card.getByText('Lune')).toBeVisible()
  await expect(card.getByText('Terre')).toBeVisible()
})
