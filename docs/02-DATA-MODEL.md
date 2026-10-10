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
  noteTypes!: EntityTable<NoteType, 'id'>     // M8

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
    // M8 : types de notes personnalisés (nouvelle table, index sur un champ facultatif : pas d'upgrade)
    this.version(2).stores({
      notes:     'id, deckId, modelType, noteTypeId, *tags, sourceGuid, updatedAt',
      noteTypes: 'id, name, sourceId',
    })
  }
}
```

Règles de migration : chaque changement de schéma = nouvelle `version(n)` avec `upgrade()` ; jamais modifier une version publiée ; un test unitaire ouvre une base V(n-1) et vérifie la migration.

## 2. Types

```ts
// src/lib/domain/types.ts
export type SchedulerKind = 'fsrs' | 'leitner'
export type ModelType = 'basic' | 'basic_reverse' | 'cloze' | 'image_occlusion' | 'custom'   // image_occlusion : V1 ; custom : M8 (§2.2)

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
  burySiblings: boolean        // défaut true : pas deux cartes jumelles le même jour (03 §5.2)
  fsrs: {
    requestRetention: number   // 0.80–0.97, défaut 0.90
    maximumInterval: number    // jours, défaut 365 (écho au compartiment 7 « tous les ans » ; réglable)
    learningSteps: string[]    // défaut ['10m', '10m'] (P11, voir 03 §2.5)
    relearningSteps: string[]  // défaut ['10m']
    params: number[] | null    // null = paramètres par défaut FSRS-6 ; sinon 21 valeurs
    ratingMode: 4 | 2          // 4 boutons ou 2 (Encore/Bien)
  }
  leitner: {
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
  noteTypeId?: string          // custom uniquement : son NoteType (§2.2)
  fields: string[]             // basic: [recto, verso, extra] ; cloze: [texte, extra] ;
                               // image_occlusion: [image, masques JSON, en-tête, extra] (§2.1) ;
                               // custom: un par champ de son type, dans l'ordre
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
  ord: number                  // 0: recto→verso, 1: verso→recto, cloze: index-1, image_occlusion: groupe-1, custom: indice du modèle de carte
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

Clés `settings` réservées : `dayStartHour` (4), `theme`, `fontScale`, `lastBackupAt`, `persistGranted`, `onboardingDone`, `globalReviewsPerDay` (500), `lastDeckId` (null), `sleepTipDay` (null), `swipeGestures` (false), `browserView` (`list`), `flipStyle` (`horizontal`), `tileSize` (`medium`).

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

### 2.2 Types de notes personnalisés (M8)

```ts
export interface CardTemplate { name: string; front: string; back: string }
export interface NoteType {
  id: string
  name: string
  fields: string[]           // noms uniques (sans casse), sans { } : " ni # ^ / en tête
  templates: CardTemplate[]  // au moins un ; ord d'une carte = indice de son modèle
  sourceId?: number          // id du type Anki à l'import (réimport et réexport le réutilisent)
  anki?: { css?: string; latexPre?: string; latexPost?: string; sortField?: number }
                             // M10 : style du type Anki, inutilisé par Recto, rendu par l'export .apkg
  createdAt: number
  updatedAt: number
}
```

- Les modèles utilisent un sous-ensemble de la syntaxe Anki (`src/lib/domain/templates.ts`, ADR-010) : `{{Champ}}`, `{{FrontSide}}` (verso), sections `{{#Champ}}…{{/Champ}}` et `{{^Champ}}…{{/Champ}}`, filtres `text:` (sans HTML), `type:` (réponse tapée : rien n'est rendu, Recto compare), tout autre filtre rend la valeur ; un champ inconnu et les spéciaux (`{{Tags}}`, `{{Deck}}`…) rendent une chaîne vide. Le rendu passe par `sanitize()` comme tout champ (les styles en ligne d'Anki sont retirés ; `<hr>` est permis). Le CSS du type Anki est ignoré.
- Une note a une carte par modèle dont la question rendue n'est pas vide et diffère de la question rendue avec tous les champs vides (règle d'Anki). En révision, le verso rendu remplace la question (il la reprend par `{{FrontSide}}`) ; pas d'Extra ; Leitner n'échange jamais les faces.
- Modifier un type (`updateNoteType`, une transaction) : champs ajoutés (vides), retirés ou réordonnés (M10) dans toutes ses notes, cartes déplacées avec leur modèle quand un modèle est retiré ou réordonné (leur `ord` suit), créées ou supprimées selon la règle ci-dessus (journal conservé). Renommer un champ réécrit ses références dans les modèles. Un type utilisé par une note ne se supprime pas.
- Réordonner (M10) : chaque champ et chaque modèle de l'édition (`NoteTypeEdit`) garde son indice d'origine `from` (null s'il est nouveau) ; c'est cet indice, non le nom ni la position, qui relie la valeur d'une note à son champ et une carte à son modèle. Enregistrer écrit donc `fields` de chaque note dans le nouvel ordre des champs et donne à chaque carte pour `ord` la nouvelle position de son modèle : même `id`, même planification, même journal ; aucune carte n'est créée ni supprimée par un simple changement d'ordre (les modèles désignent les champs par leur nom, la question de chaque carte reste la même). Déplacer, renommer, ajouter et retirer se combinent dans un même enregistrement. L'ordre des champs est celui du formulaire de note et de l'export Anki ; le premier champ est la clé de détection des doublons de l'éditeur de notes. Annuler (`undoReview`) une réponse donnée avant un déplacement rend à la carte sa planification d'avant mais garde son `ord` actuel, comme son paquet actuel : la pile d'annulation d'une séance de révision survit à la navigation vers l'éditeur de types.

## 3. Invariants (à tester)

1. `card.deckId === note.deckId` pour toute carte (mise à jour en transaction lors d'un déplacement de note).
2. Une note `basic` a exactement une carte `ord=0` ; `basic_reverse` exactement `ord=0` et `ord=1` ; `cloze` une carte par index distinct présent dans le texte ; `image_occlusion` une carte par groupe de masques distinct ; `custom` une carte par modèle de carte dont la question n'est pas vide (§2.2) (les cartes des index, groupes ou modèles supprimés sont supprimées avec leur journal conservé). Vaut aussi pour une note mise à jour hors de l'éditeur (M10) : réimport `.apkg` (05 §2.3) et fusion de sauvegarde (§5) réconcilient ses cartes avec son nouveau contenu, avec la même fonction `reconcileCards` que l'éditeur (deux cartes de même `ord` n'en font plus qu'une).
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
manifest.json   { "format": "recto-backup", "schemaVersion": 3, "appVersion": "0.x", "exportedAt": ms, "device": "<navigator.userAgent tronqué à 120 car.>", "counts": {...} }
data.json       { "decks": [...], "noteTypes": [...], "notes": [...], "cards": [...], "reviews": [...], "settings": [...],
                  "media": [{ "name", "mime", "size", "sha256", "createdAt" }] }   // sans blobs
media/<name>    fichiers binaires
```

`schemaVersion` : 2 depuis la V1 (ajout du type `image_occlusion`), 3 depuis M8 (table `noteTypes`, notes `custom` ; une note `custom` sans son type est rejetée à la lecture). Une sauvegarde de version 1 ou 2 se restaure telle quelle (pas de type personnalisé), une version plus récente que l'application est refusée. Fusion : un type de note est identifié par `id`, le plus récemment modifié gagne.

Restauration « remplacer » : vide la base puis importe ; « fusionner » : les entités sont identifiées par `id` (et `sourceGuid` pour les notes) ; en cas de conflit, la version la plus récente (`updatedAt`) gagne, les journaux sont unionnés par `id`.

**Fusion et cartes (M10).** Dans la même transaction, après celle des notes, chaque note que la fusion touche (note de la sauvegarde gardée : nouvelle, de même `id`, ou reconnue par `sourceGuid` sous un autre `id` et plus récente que la locale, dont elle remplace alors champs et tags) reçoit exactement les cartes de son contenu gagnant (invariant 2), calculées avec les types de notes d'après fusion (les locaux et ceux de la sauvegarde retenus). Les cartes candidates sont les locales de la note et celles de la sauvegarde, rattachées à la note locale et à son paquet (invariant 1) quand la note a été reconnue par `sourceGuid` ; deux copies d'une même carte (même `id`) se départagent par la règle déjà en vigueur, la plus récemment révisée gagne (à égalité, le plus de répétitions, puis la locale). Puis, pour chaque `ord` :
- plus produit par le contenu gagnant : la carte est supprimée (locale) ou n'est pas ajoutée (sauvegarde), son journal est conservé (invariant 3) ;
- plusieurs cartes pour le même `ord` (deux appareils ont chacun créé la carte du même nouveau trou, ou une note reconnue par `sourceGuid` a ses cartes des deux côtés) : la plus récemment révisée reste, les autres sont supprimées, journal conservé ;
- produit mais sans carte : la carte de la sauvegarde pour cet `ord` est adoptée quand elle existe (`noteId` et `deckId` suivent la note locale, ses révisions sont importées avec elle, P10), sinon une carte neuve est créée.

Le journal de la sauvegarde est unionné pour toutes les cartes lues, gardées ou non (une révision déjà faite ne se perd pas). Ne sont pas touchées : les notes que la sauvegarde n'apporte pas, et une note reconnue par `sourceGuid` mais moins récente que la locale (elle reste avec ses cartes). Un contenu qui ne produit aucune carte n'est pas un état que l'application écrit : les cartes de sa note ne sont pas supprimées. Le rapport (`RestoreReport`) compte les cartes ajoutées (`cards`, adoptées ou neuves) et supprimées (`cardsRemoved`). Aucune version Dexie nouvelle.
