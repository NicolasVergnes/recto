import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const sample = (name: string) => resolve(process.cwd(), 'data/samples', name)

test('an Anki note type with 4 card templates is kept: one card per template', async ({ page }) => {
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(sample('multi-template.apkg'))
  await expect(page.getByRole('listitem').filter({ hasText: 'Departements →' })).toContainText(
    'Type personnalisé (4 cartes par note)',
  )
  await page.getByRole('button', { name: 'Importer 3 notes' }).click()
  await expect(page.getByText('3 notes créées')).toBeVisible()
  await expect(page.getByText('11 cartes créées')).toBeVisible()
  await expect(page.getByText('Types de notes créés : Departements')).toBeVisible()

  // The browser shows each card rendered from its template; inline styles are dropped.
  await page.goto('/#/cards')
  await expect(page.getByText('11 cartes')).toBeVisible()
  await page.getByLabel('Rechercher').fill('Laon')
  const row = page.getByRole('row').filter({ hasText: 'Laon est la préfecture de' })
  await expect(row).toContainText('02 Aisne')

  // The note opens with its named fields and previews its four cards.
  await page.getByRole('link', { name: /Laon est la préfecture de/ }).click()
  await expect(page.getByLabel('Dept', { exact: true })).toHaveValue('Aisne')
  await expect(page.getByLabel('Prefecture', { exact: true })).toHaveValue('Laon')
  await expect(page.getByLabel('Type')).toBeDisabled()
  const preview = page.getByRole('region', { name: /^Aperçu/ })
  await expect(preview.getByText('QNumero')).toBeVisible()
  await expect(preview.locator('.preview')).toHaveCount(4)
})

test('a note type is created, used and given a second card', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Monde')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Monde' })).toBeVisible()

  await page.goto('/#/settings')
  await page.getByRole('link', { name: 'Gérer les types de notes' }).click()
  await page.getByRole('button', { name: 'Nouveau type' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Type de note' })).toBeVisible()
  await page.getByLabel('Nom', { exact: true }).fill('Pays')
  // Renaming a field rewrites the templates that use it.
  await page.getByLabel('Nom du champ 1').fill('Pays')
  await page.getByLabel('Nom du champ 1').blur()
  await page.getByLabel('Nom du champ 2').fill('Capitale')
  await page.getByLabel('Nom du champ 2').blur()
  await expect(page.getByLabel('Recto (question)')).toHaveValue('{{Pays}}')
  await expect(page.getByLabel('Verso (réponse)')).toHaveValue(
    '{{FrontSide}}<hr id=answer>{{Capitale}}',
  )
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()

  // A note of this type: its fields are named.
  await page.goto('/#/notes/new')
  await page.getByLabel('Type').selectOption({ label: 'Pays' })
  await page.getByLabel('Pays', { exact: true }).fill('France')
  await page.getByLabel('Capitale', { exact: true }).fill('Paris')
  await expect(page.getByText('Cette note produira 1 carte.')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (1 carte)')).toBeVisible()

  // A second template asking the capital: saving announces the card it creates.
  await page.goto('/#/note-types')
  await expect(page.getByRole('listitem').filter({ hasText: 'Pays' })).toContainText(
    '2 champs · 1 carte par note · 1 note',
  )
  await page.getByRole('link', { name: 'Pays', exact: true }).click()
  await page.getByRole('button', { name: 'Ajouter une carte' }).click()
  await page.getByLabel('Recto (question)').nth(1).fill('{{Capitale}} est la capitale de ?')
  await page.getByLabel('Verso (réponse)').nth(1).fill('{{Pays}}')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Modifier les notes et les cartes de ce type' })
  await expect(dialog).toContainText('créera 1 carte(s) et en supprimera 0')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  // Saved once the editor shows the stored type again (two cards, the new one named).
  await expect(page.getByLabel('Nom de la carte').nth(1)).toHaveValue('Carte 2')
  await expect(page.getByText('Type de note enregistré').last()).toBeVisible()

  await page.goto('/#/cards')
  await expect(page.getByText('2 cartes')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Paris est la capitale de ?' })).toBeVisible()
  // A type in use cannot be deleted: the reason is given.
  await page.goto('/#/note-types')
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText(/Des notes utilisent ce type/)).toBeVisible()
})

/**
 * A deck « Monde », a type « Capitales » with three fields (Pays, Capitale, Continent) and two
 * cards (« Carte 1 » asks the country, « Carte 2 » the capital), and one note: France, Paris,
 * Europe. Leaves the page on the note type editor.
 */
async function capitales(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Monde')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Monde' })).toBeVisible()

  await page.goto('/#/note-types')
  await page.getByRole('button', { name: 'Nouveau type' }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Capitales')
  await page.getByLabel('Nom du champ 1').fill('Pays')
  await page.getByLabel('Nom du champ 1').blur()
  await page.getByLabel('Nom du champ 2').fill('Capitale')
  await page.getByLabel('Nom du champ 2').blur()
  await page.getByRole('button', { name: 'Ajouter un champ' }).click()
  await page.getByLabel('Nom du champ 3').fill('Continent')
  await page.getByLabel('Nom du champ 3').blur()
  await page.getByRole('button', { name: 'Ajouter une carte' }).click()
  await page.getByLabel('Recto (question)').nth(1).fill('{{Capitale}} est la capitale de ?')
  await page.getByLabel('Verso (réponse)').nth(1).fill('{{FrontSide}}<hr id=answer>{{Pays}}')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()
  // Dismissed, so that the next save does not meet this toast again.
  await page.locator('.toast').getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByText('Type de note enregistré')).toHaveCount(0)

  await page.goto('/#/notes/new')
  await page.getByLabel('Type').selectOption({ label: 'Capitales' })
  await page.getByLabel('Pays', { exact: true }).fill('France')
  await page.getByLabel('Capitale', { exact: true }).fill('Paris')
  await page.getByLabel('Continent', { exact: true }).fill('Europe')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByText('Note ajoutée (2 cartes)')).toBeVisible()

  await page.goto('/#/note-types')
  await page.getByRole('link', { name: 'Capitales', exact: true }).click()
  await expect(page.getByLabel('Nom du champ 3')).toHaveValue('Continent')
}

const moveField = (page: Page, how: 'Monter' | 'Descendre', name: string) =>
  page.getByRole('button', { name: `${how} le champ « ${name} »` })
const moveCard = (page: Page, how: 'Monter' | 'Descendre', name: string) =>
  page.getByRole('button', { name: `${how} la carte « ${name} »` })
/** The polite live region that spoke `text` (what a screen reader announces after a move). */
const announced = (page: Page, text: string) =>
  page.locator('[aria-live="polite"]', { hasText: text })

test('fields and cards move up and down; the notes, the cards and their schedule follow', async ({
  page,
}) => {
  await capitales(page)
  // Study the card asked first (random order, M13): its schedule tells the two cards apart after
  // the move. « Carte 1 » asks France → Paris, « Carte 2 » Paris → France.
  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card).toContainText(/France|Paris/)
  const askedCarte1 = !((await card.textContent()) ?? '').includes('capitale de')
  await page.keyboard.press('Space')
  await expect(card).toContainText(askedCarte1 ? 'Paris' : 'France')
  await page.keyboard.press('3')
  // The other card of the note is not buried (M13): it comes next.
  await expect(page.getByText('1 en apprentissage')).toBeVisible()

  await page.goto('/#/note-types')
  await page.getByRole('link', { name: 'Capitales', exact: true }).click()
  // Fields: « Continent » to the top (two moves up); the ends cannot go further.
  await moveField(page, 'Monter', 'Continent').click()
  await moveField(page, 'Monter', 'Continent').click()
  await expect(page.getByLabel('Nom du champ 1')).toHaveValue('Continent')
  await expect(page.getByLabel('Nom du champ 2')).toHaveValue('Pays')
  await expect(page.getByLabel('Nom du champ 3')).toHaveValue('Capitale')
  await expect(moveField(page, 'Monter', 'Continent')).toBeDisabled()
  await expect(moveField(page, 'Descendre', 'Capitale')).toBeDisabled()
  await expect(moveField(page, 'Descendre', 'Continent')).toBeEnabled()
  // Cards: « Carte 2 » first. The templates name their fields: their text is unchanged.
  await moveCard(page, 'Monter', 'Carte 2').click()
  await expect(page.getByLabel('Nom de la carte').first()).toHaveValue('Carte 2')
  await expect(page.getByLabel('Recto (question)').first()).toHaveValue(
    '{{Capitale}} est la capitale de ?',
  )
  await expect(moveCard(page, 'Monter', 'Carte 2')).toBeDisabled()
  await expect(moveCard(page, 'Descendre', 'Carte 1')).toBeDisabled()
  // The preview lists the cards in the new order.
  const preview = page.getByRole('region', { name: /^Aperçu/ })
  await expect(preview.locator('.preview > p')).toHaveText(['Carte 2', 'Carte 1'])

  // Nothing to create or delete: saved at once, no confirmation.
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Nom du champ 1')).toHaveValue('Continent')
  await expect(page.getByLabel('Nom de la carte').first()).toHaveValue('Carte 2')

  // The note form lists the fields in the new order, with their values.
  await page.goto('/#/cards')
  await page.getByRole('link', { name: 'France', exact: true }).click()
  await expect(page.locator('label[for^="field-"]')).toHaveText(['Continent', 'Pays', 'Capitale'])
  await expect(page.getByLabel('Continent', { exact: true })).toHaveValue('Europe')
  await expect(page.getByLabel('Pays', { exact: true })).toHaveValue('France')
  await expect(page.getByLabel('Capitale', { exact: true })).toHaveValue('Paris')

  // The mosaic: each card keeps its question, its answer and its schedule.
  await page.goto('/#/cards')
  await page.getByRole('radio', { name: 'Mosaïque recto-verso' }).check()
  const tiles = page.getByRole('list', { name: 'Mosaïque des cartes' }).getByRole('listitem')
  await expect(tiles).toHaveCount(2)
  const studied = tiles.filter({ hasText: 'Apprentissage' })
  await expect(studied).toHaveCount(1)
  const fresh = tiles.filter({ hasText: 'Nouvelle' })
  await expect(fresh).toHaveCount(1)
  for (const tile of [studied, fresh]) {
    await expect(tile).toContainText('France')
    await expect(tile).toContainText('Paris')
  }
  const [carte1, carte2] = askedCarte1 ? [studied, fresh] : [fresh, studied]
  await expect(carte1).not.toContainText('capitale de')
  await expect(carte2).toContainText('Paris est la capitale de ?')
})

test('by keyboard, the focus stays on the moved row and its new place is announced', async ({
  page,
}) => {
  await capitales(page)
  // « Continent » goes up from the last place: the focus follows it, button after button.
  await moveField(page, 'Monter', 'Continent').focus()
  await page.keyboard.press('Enter')
  await expect(announced(page, 'Champ « Continent » en position 2 sur 3')).toHaveCount(1)
  await expect(moveField(page, 'Monter', 'Continent')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(announced(page, 'Champ « Continent » en position 1 sur 3')).toHaveCount(1)
  // At the top « Monter » is disabled: the focus moves to « Descendre », which goes on.
  await expect(moveField(page, 'Monter', 'Continent')).toBeDisabled()
  await expect(moveField(page, 'Descendre', 'Continent')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(announced(page, 'Champ « Continent » en position 2 sur 3')).toHaveCount(1)
  await expect(moveField(page, 'Descendre', 'Continent')).toBeFocused()
  await expect(page.getByLabel('Nom du champ 1')).toHaveValue('Pays')
  await expect(page.getByLabel('Nom du champ 2')).toHaveValue('Continent')
  await expect(page.getByLabel('Nom du champ 3')).toHaveValue('Capitale')

  // Cards: « Carte 1 » down to the last place, then back up.
  await moveCard(page, 'Descendre', 'Carte 1').focus()
  await page.keyboard.press('Enter')
  await expect(announced(page, 'Carte « Carte 1 » en position 2 sur 2')).toHaveCount(1)
  await expect(moveCard(page, 'Descendre', 'Carte 1')).toBeDisabled()
  await expect(moveCard(page, 'Monter', 'Carte 1')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(announced(page, 'Carte « Carte 1 » en position 1 sur 2')).toHaveCount(1)
  await expect(moveCard(page, 'Descendre', 'Carte 1')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Nom de la carte').first()).toHaveValue('Carte 2')

  // Saved, each card still asks its own template (in random order, M13).
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()
  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card).toContainText(/France|Paris/)
  const askedCapital = ((await card.textContent()) ?? '').includes('capitale de')
  const [question, answer] = askedCapital
    ? ['Paris est la capitale de ?', 'France']
    : ['France', 'Paris']
  await expect(card).toContainText(question)
  await expect(page.getByText(answer, { exact: true })).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(card).toContainText(answer)
})

test('a field renamed and moved with no pause keeps its new name and the cards follow it', async ({
  page,
}) => {
  await page.goto('/#/note-types')
  await page.getByRole('button', { name: 'Nouveau type' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Type de note' })).toBeVisible()
  // « Verso » is renamed and goes up straight away: the click validates the name, then moves it.
  await page.getByLabel('Nom du champ 2').fill('Réponse')
  await page.getByRole('button', { name: 'Monter le champ « Verso »' }).click()
  await expect(page.getByLabel('Nom du champ 1')).toHaveValue('Réponse')
  await expect(page.getByLabel('Nom du champ 2')).toHaveValue('Recto')
  await expect(page.getByLabel('Recto (question)')).toHaveValue('{{Recto}}')
  await expect(page.getByLabel('Verso (réponse)')).toHaveValue(
    '{{FrontSide}}<hr id=answer>{{Réponse}}',
  )
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Nom du champ 1')).toHaveValue('Réponse')
  await expect(page.getByLabel('Nom du champ 2')).toHaveValue('Recto')
})

test('an answer given before the cards moved is undone under the new place of its card', async ({
  page,
}) => {
  await capitales(page)
  // Answer the card asked first (random order, M13), then leave the review: the session keeps
  // its undo. « Carte 1 » asks France → Paris, « Carte 2 » Paris → France.
  await page.goto('/#/review')
  const card = page.getByRole('article', { name: 'Carte' })
  await expect(card).toContainText(/France|Paris/)
  const askedCarte1 = !((await card.textContent()) ?? '').includes('capitale de')
  await page.keyboard.press('Space')
  await page.keyboard.press('3')
  const learning = page.getByText('1 en apprentissage')
  await expect(learning).toBeVisible()

  // « Carte 2 » goes first: the cards of the note swap their places.
  await page.goto('/#/note-types')
  await page.getByRole('link', { name: 'Capitales', exact: true }).click()
  await moveCard(page, 'Monter', 'Carte 2').click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()

  // Undone, it comes back as « Carte 1 » (what its template asks), not as the other card, which
  // now holds the index it used to have.
  await page.goto('/#/review')
  await expect(learning).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('0 en apprentissage')).toBeVisible()
  if (askedCarte1) {
    await expect(card).toContainText('France')
    await expect(card).not.toContainText('capitale de')
  } else {
    await expect(card).toContainText('Paris est la capitale de ?')
  }
  await page.goto('/#/cards')
  await page.getByRole('radio', { name: 'Mosaïque recto-verso' }).check()
  const tiles = page.getByRole('list', { name: 'Mosaïque des cartes' }).getByRole('listitem')
  await expect(tiles).toHaveCount(2)
  await expect(tiles.filter({ hasText: 'Nouvelle' })).toHaveCount(2)
  await expect(tiles.filter({ hasText: 'Paris est la capitale de ?' })).toHaveCount(1)
})

// M11: a field a card uses cannot be removed (its card would show nothing); removing a field
// that holds something is announced before saving.
test('a field used by a card stays; removing a filled field asks first', async ({ page }) => {
  await capitales(page)
  const removeField = (name: string) =>
    page.getByRole('button', { name: `Retirer le champ « ${name} »` })
  await removeField('Pays').click()
  await expect(
    page.getByText(
      'Le champ « Pays » est utilisé par les cartes « Carte 1 », « Carte 2 » : retirez-le de leurs modèles avant de supprimer le champ.',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Nom du champ 1')).toHaveValue('Pays')
  await expect(removeField('Pays')).toBeFocused()

  // « Continent » is in no template, but France has one: saving says what will be lost.
  await removeField('Continent').click()
  await expect(page.getByLabel('Nom du champ 3')).toHaveCount(0)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Modifier les notes et les cartes de ce type' })
  await expect(dialog).toContainText(
    'Le champ « Continent » sera supprimé : 1 note perdra son contenu.',
  )
  await expect(dialog).not.toContainText('créera')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Type de note enregistré')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Nom du champ 3')).toHaveCount(0)

  // A template naming a field that does not exist is refused, with the card and the field.
  await page.getByLabel('Recto (question)').first().fill('{{Pays}} {{Continent}}')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(
    page.getByText(
      'La carte « Carte 1 » utilise le champ « Continent », qui n’existe pas : corrigez son modèle ou recréez ce champ.',
    ),
  ).toBeVisible()
})
