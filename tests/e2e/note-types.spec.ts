import { resolve } from 'node:path'
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
  const dialog = page.getByRole('dialog', { name: 'Modifier les cartes de ce type' })
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
