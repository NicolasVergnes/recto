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
