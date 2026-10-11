import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const legacy = resolve(process.cwd(), 'data/samples/sample-legacy.apkg')

type Row = Record<string, unknown>

/** The notes and cards of the app's IndexedDB, as stored. */
async function dump(page: Page): Promise<{ notes: Row[]; cards: Row[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('recto')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = (name: string) =>
      new Promise<Row[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const stored = { notes: await all('notes'), cards: await all('cards') }
    db.close()
    return stored
  })
}

const ordsOf = (stored: { cards: Row[] }, noteId: unknown) =>
  stored.cards
    .filter((c) => c['noteId'] === noteId)
    .map((c) => Number(c['ord']))
    .sort((a, b) => a - b)

async function importLegacy(page: Page) {
  await page.goto('/#/cards')
  await page.goto('/#/import')
  await page.getByText('Paquet Anki (.apkg)').first().click()
  await page.getByLabel('Paquet Anki (.apkg)').setInputFiles(legacy)
  await page.getByRole('button', { name: 'Importer 4 notes' }).click()
  await expect(page.getByText('4 notes créées')).toBeVisible()
}

// 02 §5 (M10): merging a backup leaves each note with exactly the cards of its newer content.
test('merging a backup: the same Anki note under another id follows its newer content', async ({
  page,
}, testInfo) => {
  // Device A: the sample package, then the cloze note loses its hole 2 and gains a hole 3.
  await importLegacy(page)
  await page.goto('/#/cards')
  await page
    .getByRole('link', { name: /La \[…\] tourne autour/ })
    .first()
    .click()
  await page
    .getByLabel('Texte', { exact: true })
    .fill('La {{c1::Lune}} tourne autour de la Terre et du {{c3::Soleil}}.')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Note enregistrée')).toBeVisible()
  const edited = await dump(page)
  const guid = 'rS5tU7vW9x'
  const [noteA] = edited.notes.filter((n) => n['sourceGuid'] === guid)
  expect(ordsOf(edited, noteA?.['id'])).toEqual([0, 2])

  await page.goto('/#/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sauvegarder maintenant' }).click(),
  ])
  const backup = testInfo.outputPath('device-a.recto.zip')
  await download.saveAs(backup)

  // Device B: nothing, then the same package again: same Anki notes, other ids, cards 0 and 1.
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page.getByLabel('Télécharger une sauvegarde avant d’effacer').uncheck()
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Oui, tout effacer' }).click()
  await expect(page.getByRole('button', { name: 'Créer un paquet' })).toBeVisible()
  await importLegacy(page)
  const before = await dump(page)
  const [noteB] = before.notes.filter((n) => n['sourceGuid'] === guid)
  expect(noteB?.['id']).not.toBe(noteA?.['id'])
  expect(ordsOf(before, noteB?.['id'])).toEqual([0, 1])

  // Restore A's backup by merging into B.
  await page.goto('/#/import')
  await page.getByText('Sauvegarde Recto').first().click()
  await page.getByLabel('Sauvegarde Recto').setInputFiles(backup)
  await expect(page.getByLabel('Fusionner avec les données actuelles')).toBeChecked()
  await page.getByRole('button', { name: 'Restaurer' }).click()
  const report = page.getByRole('status').filter({ hasText: 'Ajoutés' })
  // The hole 2 card goes, the hole 3 card of device A comes (and no second note appears).
  await expect(report).toContainText('notes 0, cartes 1,')
  await expect(report).toContainText('notes mises à jour : 1 ; cartes supprimées : 1.')

  const merged = await dump(page)
  const same = merged.notes.filter((n) => n['sourceGuid'] === guid)
  expect(same.map((n) => n['id'])).toEqual([noteB?.['id']])
  expect(ordsOf(merged, noteB?.['id'])).toEqual([0, 2])
  expect(merged.cards).toHaveLength(before.cards.length)
  for (const card of merged.cards) {
    const note = merged.notes.find((n) => n['id'] === card['noteId'])
    expect(note?.['deckId']).toBe(card['deckId'])
  }
})

/** Saves a backup from Settings, returns its path. */
async function saveBackup(page: Page, path: string): Promise<string> {
  await page.goto('/#/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Sauvegarder maintenant' }).click(),
  ])
  await download.saveAs(path)
  return path
}

async function mergeBackup(page: Page, path: string) {
  await page.goto('/#/import')
  await page.getByText('Sauvegarde Recto').first().click()
  await page.getByLabel('Sauvegarde Recto').setInputFiles(path)
  await expect(page.getByLabel('Fusionner avec les données actuelles')).toBeChecked()
  await page.getByRole('button', { name: 'Restaurer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Ajoutés' })).toBeVisible()
}

// M12: two devices (two browser profiles), each merging the other's backup. A note deleted on
// one never comes back from the other; the other deletes it too.
test('a note deleted on one device stays deleted after merging both ways', async ({
  browser,
}, testInfo) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await a.goto('/')
  await a.getByRole('button', { name: 'Créer un paquet' }).click()
  await a.getByRole('dialog').getByLabel('Nom').fill('Animaux')
  await a.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await a.getByRole('link', { name: 'Ajouter une note' }).click()
  const notes: [string, string][] = [
    ['Chien', 'Dog'],
    ['Chat', 'Cat'],
  ]
  for (const [front, back] of notes) {
    await a.getByLabel('Recto').fill(front)
    await a.getByLabel('Verso', { exact: true }).fill(back)
    await a.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(a.getByLabel('Recto')).toHaveValue('')
  }
  // B starts as a copy of A.
  await b.goto('/')
  await mergeBackup(b, await saveBackup(a, testInfo.outputPath('a1.recto.zip')))
  await b.goto('/#/cards')
  await expect(b.getByText('2 cartes')).toBeVisible()

  // A deletes « Chien »; B, which does not know it, saves its backup.
  await a.goto('/#/cards')
  await a.getByRole('radio', { name: 'Liste', exact: true }).check()
  await a.getByRole('checkbox', { name: /Sélectionner « Chien/ }).check()
  await a.getByRole('button', { name: 'Supprimer' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(a.getByText('1 note supprimée')).toBeVisible()
  const fromB = await saveBackup(b, testInfo.outputPath('b1.recto.zip'))

  // A merges B: « Chien » does not come back.
  await mergeBackup(a, fromB)
  await a.goto('/#/cards')
  await expect(a.getByText('1 carte', { exact: true })).toBeVisible()
  await expect(a.getByRole('row').filter({ hasText: 'Chien' })).toHaveCount(0)

  // B merges A: « Chien » is deleted there too, and the report says so.
  await mergeBackup(b, await saveBackup(a, testInfo.outputPath('a2.recto.zip')))
  await expect(
    b.getByText('Supprimés ici comme sur l’autre appareil : 1 paquet, note ou type de note.'),
  ).toBeVisible()
  await b.goto('/#/cards')
  await expect(b.getByText('1 carte', { exact: true })).toBeVisible()
  await expect(b.getByRole('row').filter({ hasText: 'Chat' })).toHaveCount(1)
  await a.context().close()
  await b.context().close()
})
