# 02 — Modèle de données (Dexie 4 / IndexedDB)

Base : `recto` (nom Dexie). Toutes les dates sont des **entiers epoch en millisecondes UTC** (indexables). Les identifiants sont des chaînes ULID-like générées côté client (`crypto.randomUUID()` suffit en V0). Conversion `Date` ↔ nombre uniquement à la frontière avec `ts-fsrs`.

## 1. Tables et index

```ts
// src/lib/db/schema.ts
import Dexie, { type EntityTable } from 'dexie'

export class RectoDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  notes!: EntityTable<Note, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<Review, 'id'>
  media!: EntityTable<Media, 'name'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'recto') {   // nom paramétrable pour les tests
    super(name)
    this.version(1).stores({
      decks:    'id, parentId, name',
      notes:    'id, deckId, modelType, *tags, sourceGuid, updatedAt',
      cards:    'id, noteId, deckId, due, state, box, [deckId+due], [deckId+state], [noteId+ord]',
      reviews:  'id, cardId, reviewedAt, [cardId+reviewedAt]',
      media:    'name, sha256, createdAt',
      settings: 'key',
    })
  }
}
```

Règles de migration : chaque changement de schéma = nouvelle `version(n)` avec `upgrade()` ; jamais modifier une version publiée ; un test unitaire ouvre une base V(n-1) et vérifie la migration.

## 2. Types

```ts
// src/lib/domain/types.ts
export type SchedulerKind = 'fsrs' | 'leitner'
export type ModelType = 'basic' | 'basic_reverse' | 'cloze' | 'image_occlusion'   // image_occlusion : V1

export interface Deck {
  id: string
  name: string
  description?: string
  parentId?: string | null
  emoji?: string
  scheduler: SchedulerKind
  settings: DeckSettings
  createdAt: number
  updatedAt: number
}

export interface DeckSettings {
  newPerDay: number            // défaut 20
  reviewsPerDay: number        // défaut 200
  newOrder: 'added' | 'random'
  typedAnswer: boolean         // réponse tapée
  autoplayAudio: boolean
  burySiblings: boolean        // défaut true : une seule carte par note et par jour
  fsrs: {
    requestRetention: number   // 0.80–0.97, défaut 0.90
    maximumInterval: number    // jours, défaut 365 (écho au compartiment 7 « tous les ans » ; réglable)
    learningSteps: string[]    // défaut ['10m', '10m'] (P11, voir 03 §2.5)
    relearningSteps: string[]  // défaut ['10m']
    params: number[] | null    // null = paramètres par défaut FSRS-6 ; sinon 21 valeurs
    ratingMode: 4 | 2          // 4 boutons ou 2 (Encore/Bien)
  }
  leitner: {
    mode: 'interval' | 'calendar'  // voir 03-SCHEDULING §3
    intervals: number[]            // jours, défaut [1, 2, 7, 30, 90, 180, 365]
    alternateSides: boolean        // défaut true (fidèle au livret)
    allowSure: boolean             // défaut true : bouton « Sûr » (+2)
    failToBox: 1                   // fixe en V0
  }
}

export interface Note {
  id: string
  deckId: string
  modelType: ModelType
  fields: string[]             // basic: [recto, verso, extra] ; cloze: [texte, extra] ;
                               // image_occlusion: [image, masques JSON, en-tête, extra] (§2.1)
  tags: string[]
  source?: string
  sourceGuid?: string          // guid Anki à l'import (déduplication : `sourceGuid ?? id`, guid écrit par l'export .apkg, 05 §4)
  createdAt: number
  updatedAt: number
}

export type CardState = 0 | 1 | 2 | 3   // New, Learning, Review, Relearning (= ts-fsrs State)

export interface Card {
  id: string
  noteId: string
  deckId: string               // dénormalisé (= note.deckId) pour les index
  ord: number                  // 0: recto→verso, 1: verso→recto, cloze: index-1, image_occlusion: groupe-1
  // Commun
  due: number                  // prochaine échéance (ms). Nouvelle carte : createdAt
  state: CardState
  reps: number
  lapses: number
  lastReview: number | null
  suspended: boolean
  retired: boolean
  flag: 0 | 1 | 2 | 3 | 4
  // FSRS (ts-fsrs Card)
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  // Leitner
  box: number                  // 0 = non applicable / nouvelle, 1..7
  sideFlipped: boolean         // Leitner alternateSides : true = on teste verso→recto
  createdAt: number
}

export type Rating = 1 | 2 | 3 | 4     // Again, Hard, Good, Easy (= ts-fsrs Rating)
// Leitner : Oublié = 1, Réussi = 3, Sûr = 4 (Hard n'existe pas en Leitner)

export interface Review {
  id: string
  cardId: string
  deckId: string
  reviewedAt: number
  rating: Rating
  scheduler: SchedulerKind
  durationMs: number           // plafonné à 60 000 pour les stats
  // Instantané avant réponse (permet rollback et recalcul)
  stateBefore: CardState
  dueBefore: number
  stabilityBefore: number
  difficultyBefore: number
  boxBefore: number
  learningStepsBefore: number  // ts-fsrs rollback en a besoin
  lastReviewBefore: number | null
  // Résultat
  stateAfter: CardState
  dueAfter: number
  scheduledDays: number
  elapsedDays: number
  boxAfter: number
}

export interface Media {
  name: string                 // nom de fichier unique, ex. "a1b2c3d4-drapeau-france.webp"
  blob: Blob
  mime: string
  size: number
  sha256: string
  createdAt: number
}

export interface Setting { key: string; value: unknown }
```

Clés `settings` réservées : `dayStartHour` (4), `theme`, `fontScale`, `lastBackupAt`, `persistGranted`, `onboardingDone`, `globalReviewsPerDay` (500).

### 2.1 Occlusion d'image (V1)

Une note `image_occlusion` a quatre champs : `fields[0]` = `<img src="nom" alt="…">` (même forme qu'une image de champ, donc comptée par les utilitaires de médias), `fields[1]` = masques en JSON, `fields[2]` = en-tête (HTML, affiché des deux côtés), `fields[3]` = extra (après la réponse).

```ts
// src/lib/domain/occlusion.ts
{ "v": 1, "mode": "hideAll" | "hideOne",
  "masks": [{ "n": 1, "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.25, "label": "Paris" }] }
```

- Coordonnées normalisées (0–1, origine en haut à gauche) : elles survivent au redimensionnement de l'image ; arrondies à 4 décimales, bornées à l'image, côté minimal 0,5 %.
- `n` = groupe (≥ 1) : une carte par groupe distinct, `ord = n − 1` (comme `cN` d'Anki). Les masques d'un même groupe sont révélés ensemble. `n` n'est jamais recalculé depuis l'ordre des masques : supprimer un masque ne change pas l'identité des autres cartes.
- `label` (facultatif) : réponse affichée après la demande (P1) et attendue en réponse tapée.
- `hideAll` (défaut) : tous les masques cachent leur zone, celui de la carte est mis en évidence ; `hideOne` : seul le masque de la carte est dessiné.
- Le JSON est relu avec tolérance (`parseOcclusion`) et réécrit sous forme canonique à l'enregistrement (`serializeOcclusion`).

## 3. Invariants (à tester)

1. `card.deckId === note.deckId` pour toute carte (mise à jour en transaction lors d'un déplacement de note).
2. Une note `basic` a exactement une carte `ord=0` ; `basic_reverse` exactement `ord=0` et `ord=1` ; `cloze` une carte par index distinct présent dans le texte ; `image_occlusion` une carte par groupe de masques distinct (les cartes des index ou groupes supprimés sont supprimées avec leur journal conservé).
3. `reviews` est *append-only* : aucune fonction ne modifie ni ne supprime une ligne, sauf `rollback` de la dernière révision d'une carte (suppression de cette seule ligne) et la suppression explicite d'une carte/note par l'utilisateur.
4. Une carte `retired` ou `suspended` n'apparaît jamais dans la file.
5. Tout `Media.name` référencé dans un champ existe dans `media` (vérifié à l'import ; un utilitaire « médias orphelins » liste les entrées non référencées).
6. `Card` FSRS : `stability ≥ 0`, `difficulty ∈ [1, 10]` ou 0 pour `New`.
7. `Card` Leitner : `box ∈ [1, 7]` dès la première réponse ; `box = 0` tant que `state = New`.

## 4. Accès aux données

- Un module `src/lib/db/repo.ts` expose des fonctions typées (`createNoteWithCards`, `recordReview`, `moveNote`, `getDueCards`…) ; les composants n'appellent jamais Dexie directement.
- Lecture réactive : `liveQuery` de Dexie enveloppé dans un helper `$state` (`src/lib/db/live.svelte.ts`).
- Écritures multi-tables toujours dans `db.transaction('rw', …)`.
- Les blobs média sont lus à la demande et exposés par `URL.createObjectURL`, révoqués à la destruction du composant (helper `useMediaUrl`).

## 5. Sauvegarde `.recto.zip`

```
manifest.json   { "format": "recto-backup", "schemaVersion": 2, "appVersion": "0.x", "exportedAt": ms, "device": "<navigator.userAgent tronqué à 120 car.>", "counts": {...} }
data.json       { "decks": [...], "notes": [...], "cards": [...], "reviews": [...], "settings": [...],
                  "media": [{ "name", "mime", "size", "sha256", "createdAt" }] }   // sans blobs
media/<name>    fichiers binaires
```

`schemaVersion` : 2 depuis la V1 (ajout du type `image_occlusion` ; une sauvegarde de version 1 se restaure telle quelle, une version plus récente que l'application est refusée). Le schéma IndexedDB (`version(1)`) n'a pas changé.

Restauration « remplacer » : vide la base puis importe ; « fusionner » : les entités sont identifiées par `id` (et `sourceGuid` pour les notes) ; en cas de conflit, la version la plus récente (`updatedAt`) gagne, les journaux sont unionnés par `id`.
