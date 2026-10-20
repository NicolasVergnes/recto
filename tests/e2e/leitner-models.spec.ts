import { expect, test } from './fixtures'

// M19: the Boîte de Leitner has three models (7, 5 or « Ma boîte »); new decks follow the
// « planificateur des nouveaux paquets » and each deck can change its box afterwards.
test('new decks in five compartments, then « Ma boîte », followed by its decks', async ({
  page,
}) => {
  await page.goto('/#/settings')
  await page
    .getByLabel('Planificateur des nouveaux paquets')
    .selectOption({ label: 'Boîte de Leitner (5 compartiments)' })
  await expect(page.getByText('Réglage enregistré')).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un paquet' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Cinq')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cinq' })).toBeVisible()
  await expect(page.getByLabel('Boîte de Leitner (5 compartiments)', { exact: true })).toBeChecked()
  const intervals = page.getByRole('list', { name: 'Intervalles des compartiments' })
  await expect(intervals.getByRole('listitem')).toHaveText([
    /1 jour$/,
    /3 jours$/,
    /7 jours$/,
    /14 jours$/,
    /30 jours$/,
  ])

  await page.getByRole('link', { name: 'Ajouter une note' }).click()
  await page.getByLabel('Recto').fill('Soleil')
  await page.getByLabel('Verso', { exact: true }).fill('Sun')
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.getByLabel('Recto')).toHaveValue('')
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Réviser aujourd’hui' }).click()
  await page.getByRole('button', { name: 'Afficher la réponse' }).click()
  await expect(page.getByRole('button', { name: /^Réussi/ })).toContainText('dans 3 j')
  await page.keyboard.press('2')
  await expect(page.getByRole('heading', { name: 'Séance terminée' })).toBeVisible()

  // « Ma boîte »: three compartments, checked before it is saved.
  await page.goto('/#/settings')
  await page.getByLabel('Nombre de compartiments').selectOption('3')
  await page.getByLabel('Compartiment 2 (jours)').fill('4')
  await page.getByLabel('Compartiment 3 (jours)').fill('2')
  const save = page.getByRole('button', { name: 'Enregistrer Ma boîte' })
  await save.click()
  await expect(page.getByRole('alert')).toHaveText(
    'Chaque compartiment dure au moins autant que le précédent.',
  )
  await page.getByLabel('Compartiment 3 (jours)').fill('10')
  await save.click()
  await expect(page.getByText('Ma boîte enregistrée').last()).toBeVisible()

  // The deck moves to « Ma boîte »: its card keeps its compartment.
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Cinq', exact: true }).click()
  await page.getByLabel('Ma boîte de Leitner (3 compartiments)').check()
  await page.getByRole('button', { name: 'Changer de planificateur' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Chaque carte garde son compartiment')
  await dialog.getByRole('button', { name: 'Changer de planificateur' }).click()
  await expect(page.getByText('Boîte de Leitner changée')).toBeVisible()
  await expect(intervals.getByRole('listitem')).toHaveText([/1 jour$/, /4 jours$/, /10 jours$/])

  // Changing « Ma boîte » changes the decks that follow it, after saying how many.
  await page.goto('/#/settings')
  await page.getByLabel('Compartiment 2 (jours)').fill('5')
  await save.click()
  await expect(page.getByRole('dialog')).toContainText('Le paquet qui suit Ma boîte')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer Ma boîte' }).click()
  await expect(page.getByText('Ma boîte enregistrée').last()).toBeVisible()
  await page.goto('/#/')
  await page.getByRole('link', { name: 'Cinq', exact: true }).click()
  await expect(intervals.getByRole('listitem').nth(1)).toHaveText(/5 jours$/)
})

test('the scientific sources still cite the Memory Box', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByText('Sources scientifiques').click()
  await expect(page.getByRole('link', { name: /^La Memory Box, Fabien Olicard/ })).toBeVisible()
  await expect(page.getByText(/Memory Box \(7 compartiments\)/)).toHaveCount(0)
})
