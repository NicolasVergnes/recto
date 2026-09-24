---
name: dexie-local-first
description: Règles Dexie 4 / IndexedDB pour Recto — schéma versionné, transactions atomiques, journal append-only, médias en blobs, persistance et quota, sauvegarde zip, tests avec fake-indexeddb. Charger avant tout code dans src/lib/db, media, export ou import.
---

# Dexie local-first

Le schéma de référence est `docs/02-DATA-MODEL.md`. Ce skill dit comment l'écrire et le faire évoluer sans perdre de données.

## 1. Schéma et migrations

- Une seule classe `RectoDB extends Dexie` dans `src/lib/db/schema.ts` ; instance unique exportée `db`.
- `this.version(n).stores({...})` : n'indexer que ce qui est interrogé (`where`, `orderBy`). Les index composés `[deckId+due]` servent la file du jour.
- Nouvelle version = nouveau bloc `version(n+1).stores({...}).upgrade(tx => …)`. **Ne jamais éditer un bloc `version()` déjà livré.** Les `upgrade` sont idempotents et testés (ouvrir une base créée par la version précédente, vérifier les données).
- Les champs non indexés peuvent être ajoutés sans migration ; prévoir une valeur par défaut à la lecture (`card.flag ?? 0`).

## 2. Écritures

```ts
export async function recordReview(outcome: SchedulerOutcome, durationMs: number) {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.put(outcome.card)
    await db.reviews.add({ ...outcome.review, id: newId(), durationMs: Math.min(durationMs, 60_000) })
  })
}
```

- Toute écriture multi-tables est une transaction ; pas d'`await` d'une promesse non-Dexie à l'intérieur (la transaction se fermerait).
- `reviews` est append-only : seules fonctions autorisées à supprimer une ligne : `undoLastReview(cardId)` (la plus récente de cette carte) et `deleteCard/deleteNote` explicites.
- `bulkAdd`/`bulkPut` par lots de 500 pour les imports ; une transaction par lot ; progression rapportée entre les lots.
- Générer les identifiants côté application (`crypto.randomUUID()`), jamais par autoincrement (nécessaire pour les fusions de sauvegarde).

## 3. Lectures

- Requêtes indexées : `db.cards.where('[deckId+due]').between([deckId, Dexie.minKey], [deckId, dueLimit])`.
- Pour la file du jour, charger les cartes candidates en une requête par catégorie puis trier en mémoire ; ne pas itérer carte par carte.
- `liveQuery` uniquement pour les listes affichées ; jamais dans le domaine pur.

## 4. Médias

- Table `media` : `name` = nom de fichier unique (`<8 hex>-<slug>.<ext>`), `blob`, `mime`, `size`, `sha256`.
- Avant stockage : type MIME vérifié par liste blanche (image/jpeg, png, webp, gif, svg+xml ; audio/mpeg, ogg, webm, mp4, x-m4a) ; images redimensionnées via `createImageBitmap` + `OffscreenCanvas` (fallback `<canvas>`), SVG assainis par dompurify.
- Lecture : `URL.createObjectURL(blob)` dans un helper qui révoque l'URL au démontage ; cache LRU de 50 URLs pendant une séance.
- Orphelins : utilitaire qui liste les `media.name` non référencés dans `notes.fields` (regex `src="([^"]+)"` et `\[sound:([^\]]+)\]`).

## 5. Persistance, quota, sauvegardes

- `await navigator.storage.persist?.()` après la première note créée ; stocker le résultat dans `settings.persistGranted`.
- `navigator.storage.estimate()` à l'ouverture des Paramètres ; avertissement à 80 %.
- Sauvegarde zip (docs/05 §3) : construire `data.json` par tables avec `toArray()` en lots pour ne pas saturer la mémoire sur 100 000 lignes ; médias ajoutés en flux.
- Restauration : valider le manifeste ; « Remplacer » = `db.delete()` puis `db.open()` puis import ; « Fusionner » = `bulkPut` avec règle `updatedAt` max et union des `reviews` par `id`.

## 6. Tests

- `fake-indexeddb/auto` importé dans `tests/setup.ts` ; chaque test crée une base au nom unique (`new RectoDB('test-' + crypto.randomUUID())`) et la supprime après.
- Tester : invariants de docs/02 §3, atomicité (`recordReview` avec un `put` qui échoue → aucune ligne de journal), migration factice, aller-retour sauvegarde (égalité profonde après tri par `id`).
- Les blobs dans `fake-indexeddb` : utiliser `new Blob([...])` réels, comparer par `size` et `sha256`.

## 7. Pièges connus

- Dexie 4 : `EntityTable<T, 'id'>` pour typer ; `db.table.hook` est déprécié, utiliser des fonctions de repo.
- Safari : les `Blob` volumineux en IndexedDB fonctionnent depuis iOS 17 ; conserver la limite de 600 Ko/image.
- Un `await` non-Dexie dans une transaction (ex. `crypto.subtle.digest`) la ferme : calculer les hachages **avant** d'ouvrir la transaction.
- `liveQuery` ne se déclenche pas pour les écritures faites hors Dexie ; tout passe par `db`.
