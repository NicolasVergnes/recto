# 03 — Planification : FSRS-6 et Leitner « Memory Box »

Les deux planificateurs implémentent la même interface. Le choix se fait par paquet (`deck.scheduler`).

## 1. Interface commune

```ts
// src/lib/scheduler/index.ts
export interface SchedulerOutcome {
  card: Card                 // nouvel état complet
  review: Omit<Review, 'id' | 'durationMs'>
}
export interface Scheduler {
  kind: SchedulerKind
  /** Prévisualise les résultats de chaque note possible (pour afficher les intervalles sur les boutons). */
  preview(card: Card, now: number, deck: Deck): Partial<Record<Rating, { due: number; label: string }>>
  /** Applique une note. Pur : ne touche pas à la base. */
  answer(card: Card, rating: Rating, now: number, deck: Deck): SchedulerOutcome
  /** Probabilité de rappel estimée maintenant (0–1), ou null si non modélisée. */
  retrievability(card: Card, now: number, deck: Deck): number | null
  /** Ratings admis (pour le rendu des boutons). */
  ratings(deck: Deck): Rating[]
}
```

`answer` est pure ; `repo.recordReview(outcome, durationMs)` écrit carte + journal dans une transaction. `preview` sert à afficher « 10 min · 1 j · 4 j · 12 j » sur les boutons.

## 2. FSRS-6 via `ts-fsrs` 5.x

### 2.1 Construction du planificateur

```ts
import { fsrs, generatorParameters, Rating, State, createEmptyCard, type FSRSParameters } from 'ts-fsrs'

export function buildFsrs(deck: Deck) {
  const s = deck.settings.fsrs
  const params: Partial<FSRSParameters> = {
    request_retention: s.requestRetention,
    maximum_interval: s.maximumInterval,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: s.learningSteps,     // ex. ['10m']
    relearning_steps: s.relearningSteps, // ex. ['10m']
  }
  if (s.params && s.params.length === 21) params.w = s.params   // FSRS-6 : 21 paramètres, validés en amont
  return fsrs(params)   // fsrs() applique generatorParameters() en interne
}
```

Valider `deck.settings.fsrs` à la frontière (import de sauvegarde, formulaire) : `requestRetention ∈ [0.70, 0.99]` (UI limitée à 0.80–0.97), `maximumInterval ∈ [1, 36500]`, `params` = 21 nombres finis ou `null`.

### 2.2 Conversion Card ↔ ts-fsrs

```ts
function toFsrsCard(c: Card): import('ts-fsrs').Card {
  return {
    due: new Date(c.due), stability: c.stability, difficulty: c.difficulty,
    elapsed_days: 0, scheduled_days: c.scheduledDays, learning_steps: c.learningSteps,
    reps: c.reps, lapses: c.lapses, state: c.state as State,
    ...(c.lastReview ? { last_review: new Date(c.lastReview) } : {}),   // exactOptionalPropertyTypes
  }
}
```

`answer` : `const { card, log } = f.next(toFsrsCard(c), new Date(now), rating)` puis mappage inverse (`due.getTime()`, etc.). Le `log` fournit `elapsed_days`, `scheduled_days`, `state` avant, `due` avant. `preview` : `f.repeat(card, now)` et lecture de `[Rating.Again|Hard|Good|Easy].card.due`. `retrievability` : `f.get_retrievability(card, now, false)` (nombre). Annulation : `f.rollback(card, log)` avec un `ReviewLog` reconstruit depuis `Review` (`rating`, `stateBefore`, `dueBefore`, `stabilityBefore`, `difficultyBefore`, `learningStepsBefore`, `scheduledDays`, `elapsedDays`, `reviewedAt`) ; `last_elapsed_days` (déprécié) est recalculé depuis `lastReviewBefore`. Le test « rollback restaure l'état » compare le résultat à l'instantané.

### 2.3 Mode 2 boutons

Quand `ratingMode = 2`, l'UI n'affiche que **Encore** (`Rating.Again`) et **Bien** (`Rating.Good`) ; le planificateur reste FSRS à 4 notes (les analyses FSRS montrent une précision équivalente). Les raccourcis clavier deviennent 1 et 2 (ou Espace = Bien).

### 2.4 Paramètres par défaut et optimisation

- V0 : paramètres par défaut FSRS-6 de `ts-fsrs` (`params = null`). Rétention 0,90.
- V1 : optimisation dans le navigateur avec `fsrs-browser` (WASM, `Fsrs.computeParameters(ratings, delta_ts, lengths, …)`) dans un Web Worker, proposée quand le paquet cumule ≥ 1 000 révisions ; l'utilisateur voit les anciens/nouveaux paramètres et la rétention simulée avant d'accepter. Le module WASM est chargé à la demande (`import()`), jamais dans le bundle initial.

*Mise en œuvre (M6).*

- **Données** (`src/lib/db/optimize.ts`) : les révisions des cartes **propres** au paquet (chaque sous-paquet a ses réglages), réponses Leitner comprises (1/3/4 sont des notes FSRS valides).
- **Jeu d'entraînement** (`src/lib/scheduler/optimizer.ts`, pur) : une histoire par carte, triée par date, **coupée à la dernière réponse donnée à l'état Nouveau** (`stateBefore = 0` : remise à zéro, import) ; une carte sans telle réponse est ignorée. Écarts en jours d'étude (`daysBetween`, frontière 04:00, heure d'été comprise) ; les réponses du même jour (écart 0) sont gardées (modèle court terme de FSRS-6). Items = tous les préfixes (longueur ≥ 2) contenant au moins un écart > 0 (sinon fsrs-rs panique). Ordre déterministe : cartes par première réponse puis identifiant ; `card_ids` non transmis.
- **Worker** (`optimizer.worker.ts`, à usage unique, terminé après la réponse ; délai de garde 2 min côté client) : `init({ module_or_path })` puis `computeParameters(…, null, true)` en **mono-thread** (`initThreadPool` jamais appelé : pas besoin d'isolation cross-origin). Mémoire WASM partagée non disponible → « indisponible dans ce navigateur ».
- **Évaluation** (TypeScript, sur le même historique) : `next_state`/`forgetting_curve` de ts-fsrs, qui reproduisent les états de fsrs-rs. Pour chaque réponse après un écart > 0 : perte logarithmique, RMSE sur 20 classes de probabilité, réussite prédite moyenne vs réelle ; plus les intervalles d'une nouvelle carte toujours notée « Bien » (réglages du paquet). Paramètres arrondis à 4 décimales et validés (21 nombres finis).
- **Décision** : « Appliquer » n'est proposé que si la perte logarithmique baisse ; sinon « Vos paramètres actuels conviennent déjà » (cas des données trop rares : fsrs-rs renvoie alors les paramètres par défaut). « Appliquer » n'écrit que `settings.fsrs.params` et termine la séance en cours ; « Revenir aux paramètres par défaut » remet `null`. Les échéances existantes ne sont **pas recalculées** : les nouveaux paramètres s'appliquent à chaque carte lors de sa prochaine réponse.

### 2.5 Règles produit liées

- P11 : `learning_steps: ['10m', '10m']` par défaut ; l'intervalle de graduation suit FSRS (≥ 1 jour). Ne pas mettre de pas à `'1m'`.
  *Mise à jour du 2026-09-25 (M2)* : dans ts-fsrs 5, avec un seul pas `['10m']`, « Bien » sur une carte nouvelle **gradue immédiatement** (le pas suivant n'existe pas) : seuls Encore/Difficile donnent 10 min, ce qui contredit P11. Avec `['10m', '10m']` : nouvelle carte → Encore/Difficile/Bien = 10 min, Facile = graduation ; au passage suivant, Bien = graduation (≥ 1 jour). Les pas de réapprentissage restent `['10m']`.
- ts-fsrs impose Difficile < Bien < Facile : l'intervalle de Facile peut dépasser `maximum_interval` de 1 à 2 jours. Accepté.
- Retard : une carte en retard est notée normalement ; FSRS tient compte du délai réel (`elapsed_days`). Aucune pénalité ajoutée.
- `maximum_interval` par défaut 365 j en V0 pour que les cartes « acquises » repassent au moins une fois par an, en écho au compartiment 7 du livret ; réglable.

## 3. Leitner « Memory Box » (fidèle au livret Larousse 2018)

### 3.1 Ce que dit le livret

Sept compartiments ; C1 « tous les jours », C2 « les jours pairs », C3 « tous les lundis », C4 « chaque 1er du mois », C5 « tous les 3 mois », C6 « tous les 6 mois », C7 « tous les ans ». Réponse juste → compartiment suivant, carte **retournée** (au prochain test, on interroge l'autre face). Réponse fausse ou oubliée → compartiment 1. Une carte réussie en C7 y reste. Routine « temps limité » : sûr → +2, juste avec un doute → +1, faux → retour.

### 3.2 Deux modes

**`interval` (défaut)** : chaque carte a sa propre échéance : `due = now + intervals[box-1] jours` avec `intervals = [1, 2, 7, 30, 90, 180, 365]` (approximation des périodes du livret, réglable par paquet). C'est le mode recommandé : il respecte P4 (espacement par carte) et lisse la charge.

**`calendar` (fidèle)** : reproduit le livret à la lettre. Une carte est due quand *son compartiment* est « concerné par la date du jour » :

| Box | Règle | Implémentation (`isBoxDue(box, today)`) |
|---|---|---|
| 1 | tous les jours | `true` |
| 2 | jours pairs | `today.getDate() % 2 === 0` |
| 3 | tous les lundis | `today.getDay() === 1` |
| 4 | 1er du mois | `today.getDate() === 1` |
| 5 | tous les 3 mois | 1er des mois `m ≡ m0 (mod 3)` où `m0` = mois de création du paquet |
| 6 | tous les 6 mois | 1er des mois `m ≡ m0 (mod 6)` |
| 7 | tous les ans | 1er du mois `m0`, à partir de l'année suivant la création |

Une carte n'est pas due deux fois le même jour : `lastReview` du jour ⇒ non due. `due` est alors calculé comme la prochaine date où `isBoxDue` est vrai (pour l'affichage et les prévisions). Le mode `calendar` est proposé avec l'avertissement : « fidèle au coffret ; la charge est irrégulière (le 1er du mois qui tombe un lundi cumule quatre compartiments) ».

### 3.3 Notation et transitions

| Rating | Libellé | Transition |
|---|---|---|
| 1 (Again) | Oublié | `box = 1`, `lapses++`, `state = Relearning`, `due = now` (re-présentation en séance, voir 3.4) |
| 3 (Good) | Réussi | `box = min(box + 1, 7)` |
| 4 (Easy) | Sûr | `box = min(box + 2, 7)` (routine « temps limité » du livret ; si `allowSure = false`, `ratings()` renvoie `[1, 3]`) |

- Nouvelle carte (`box = 0`, `state = New`) : première réponse → Réussi/Sûr ⇒ `box = 2` (elle a été vue une fois et réussie) et `state = Review` ; Oublié ⇒ `box = 1`, `state = Relearning`, `due = now` comme ci-dessus.
- `alternateSides = true` : à chaque **succès**, `sideFlipped = !sideFlipped` ; l'écran de révision montre alors le verso comme question. En cas d'échec, la face reste la même (le livret retourne aussi la fiche, mais retester le même sens après un échec est pédagogiquement préférable et c'est ce que fait le mode `interval` ; documenter ce choix dans l'UI d'aide). Pour les notes `cloze`, `alternateSides` est ignoré.
- Carte en C7 réussie : reste en C7, `due` = + 365 j (ou prochaine date annuelle en mode `calendar`).
- `retrievability()` renvoie `null` (Leitner ne modélise pas R) ; les statistiques de rétention réelle restent calculables depuis le journal.

### 3.4 Répétition intra-séance des échecs

Comme dans le livret (« replacez la fiche dans le compartiment 1, derrière les autres, pour y revenir »), une carte notée Oublié (`state = Relearning`, `due = now`) est **re-présentée dans la même séance** : la file la réinsère au moins 10 positions plus loin (ou en fin de file) jusqu'à un succès ; au succès, `state = Review`, `box` selon 3.3 et `due = now + intervals[box-1]`. Si la séance se termine sans succès, la carte reste `Relearning` avec `due = now` : elle sera en tête de la prochaine séance (règle 5.3 de la file). **Chaque réponse est journalisée** (P10), y compris ces re-présentations, avec `scheduler = 'leitner'` ; les statistiques de rétention n'utilisent que les réponses dont `stateBefore = Review`, ce qui exclut naturellement les re-présentations (`stateBefore = Relearning`).

### 3.5 Prévisualisation

`preview` renvoie pour chaque rating le compartiment cible et l'échéance, affichés sous le bouton au format `scheduler.boxTarget` : « → C1 · demain », « → C3 · dans 7 j », « → C4 · dans 30 j ».

## 4. Changement de planificateur sur un paquet existant

- Leitner → FSRS : pour chaque carte avec journal, rejouer l'historique avec `const { reschedule_item } = f.reschedule(createEmptyCard(), history)` et prendre `reschedule_item?.card` (les ratings Leitner 1/3/4 sont des ratings FSRS valides) ; sans journal, `createEmptyCard()` avec `due` conservé.
- FSRS → Leitner : `box` déduit de la stabilité : `S < 1.5 → 1`, `< 4 → 2`, `< 15 → 3`, `< 50 → 4`, `< 120 → 5`, `< 250 → 6`, sinon `7` ; `due` conservé. Documenter que cette conversion est une approximation.
- L'opération est une transaction unique, précédée d'une sauvegarde automatique.

## 5. File du jour (`src/lib/queue`)

Entrée : `now`, `dayStartHour`, paquets sélectionnés (défaut : tous), plafonds. Sortie : liste ordonnée d'`id` de cartes + compteurs.

1. `todayStart = début de journée local (dayStartHour)` ; `dueLimit = fin de journée`.
2. Exclure `suspended`, `retired`, et, si `deck.settings.burySiblings` (défaut `true`), les cartes dont une sœur (`noteId`) a déjà été répondue aujourd'hui (enterrement des sœurs). Si l'option est désactivée, les sœurs restent dans la file mais espacées d'au moins 10 positions (étape 6).
3. **Apprentissage** : `state ∈ {Learning, Relearning}` et `due ≤ now` (intra-journée, ordre par `due`).
4. **Révisions** : `state = Review` et `due < dueLimit`, limitées par `reviewsPerDay` du paquet puis `globalReviewsPerDay`. Ordre : retards (`due < todayStart`) d'abord, par récupérabilité croissante (FSRS) ou par `box` croissante puis `due` (Leitner) ; puis cartes du jour, ordre aléatoire stable (graine = date).
5. **Nouvelles** : `state = New`, limitées par `newPerDay` moins les nouvelles déjà vues aujourd'hui, ordre `newOrder`.
6. **Entrelacement** : les paquets sont tirés en round-robin ; les nouvelles cartes sont insérées tous les *k* items (`k = round(revisions / nouvelles)`) plutôt qu'en bloc ; les cartes sœurs d'une même note sont espacées d'au moins 10 positions.
7. Les cartes en apprentissage dont `due` arrive pendant la séance sont réinsérées en tête à leur échéance (rafraîchissement de la file après chaque réponse, sans recalcul complet : opération O(1) sur une file en mémoire).

Tests : cas limites (plafond 0, paquet vide, sœurs, changement de jour à 04:00, retard de 100 jours, tri par R).

## 6. Références rapides

- `ts-fsrs` README (v5.4) : `fsrs()`, `repeat`, `next`, `get_retrievability`, `rollback`, `forget`, `reschedule`, `forgetting_curve`.
- Rétention cible et charge : manuel Anki « Deck options » ; plage conseillée 0,80–0,97.
- Livret Memory Box, pages 12–15 (compartiments) et 27–31 (routine temps limité).
