---
name: srs-rules
description: Règles pédagogiques non négociables de Recto (rappel actif, espacement, auto-évaluation, plafonds, abandon des cartes) issues de la recherche, et recette d'implémentation avec ts-fsrs 5 et le Leitner Memory Box. Charger avant tout travail sur scheduler/, queue/, l'écran de révision, l'éditeur ou les paramètres de paquet.
---

# Règles de répétition espacée (srs-rules)

Ces règles viennent du dossier de recherche (`Dossier-Flashcards.html`) ; les références sont indiquées pour que le code puisse les citer (`// P7 Kornell & Bjork 2008`). Elles priment sur toute préférence de style.

## 1. Les onze principes et comment les coder

| # | Principe | Preuve | Dans le code |
|---|---|---|---|
| P1 | Rappel actif avant feedback | Roediger & Karpicke 2006 ; Rowland 2014 (g = 0,50) | Le composant de révision ne rend jamais le verso tant que `revealed === false`. Pas de « peek ». |
| P2 | Feedback systématique | Rowland 2014 : g 0,73 avec feedback vs 0,39 sans | Après `reveal`, verso + Extra toujours affichés avant les boutons. |
| P3 | Auto-évaluation simple | Analyses FSRS : 2 boutons ≈ 4 boutons | FSRS : 4 boutons ou 2 (Again/Good) ; Leitner : Oublié/Réussi/Sûr. Jamais de « note » chiffrée libre. |
| P4 | Espacement par carte | Cepeda 2008 ; Latimier 2021 (g = 0,74) | `card.due` individuel ; aucune fonction « tout revoir maintenant » hors mode « cram » explicitement nommé (absent en V0). |
| P5 | File unique mélangée | Kornell 2009 ; Rohrer 2015 (d = 0,79) | `queue.buildToday()` entrelace les paquets ; l'accueil met « Réviser aujourd'hui » avant les paquets. |
| P6 | Plafonds, retards sans pénalité | Communautés Anki/SuperMemo ; Duolingo A/B 2016 | `newPerDay`, `reviewsPerDay`, global ; retards triés par R croissante ; pas de « dette » affichée en rouge. |
| P7 | Pas d'abandon prématuré | Kornell & Bjork 2008 ; Karpicke & Roediger 2008 | `canRetire(card, reviews)` : `state === Review` et ≥ 3 succès (`rating ≥ 3`) dont les intervalles précédents ≥ 7 j. Sinon bouton désactivé + `review.retireLocked`. |
| P8 | Cartes atomiques | Wozniak 1999 ; Rowland 2014 | Éditeur : avertissements non bloquants > 200 caractères ou liste > 4 éléments ; suggérer cloze. |
| P9 | Rétention cible visible | Manuel Anki ; simulations FSRS | Curseur 0,80–0,97, défaut 0,90, texte d'aide `scheduler.retentionHelp`. |
| P10 | Données libres | Audit : Quizlet, Memrise, Tinycards | Export un clic ; `reviews` append-only ; rappel de sauvegarde 7 j. |
| P11 | Premier rappel différé | Karpicke & Roediger 2007 ; Cepeda 2008 (~1 j pour 7 j) | `learning_steps: ['10m', '10m']` (avec un seul pas, ts-fsrs gradue « Bien » immédiatement, voir 03 §2.5) ; pas de pas `'1m'` ; graduation ≥ 1 j. |

Complément : images = indice, pas béquille (Carpenter & Olson 2012) → dans l'aide de l'éditeur, pas de contrainte technique. Sommeil (Mazza 2016) → `review.sleepTip` une fois par jour à la fin de la première séance.

## 2. ts-fsrs 5.x — recette

```ts
import { fsrs, Rating, State, createEmptyCard, type Card as FCard, type FSRSParameters } from 'ts-fsrs'

const f = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true,
                 enable_short_term: true, learning_steps: ['10m', '10m'], relearning_steps: ['10m'] })
// paramètres personnalisés : { ...params, w: number[21] }

const c: FCard = createEmptyCard(new Date(now))          // nouvelle carte
const preview = f.repeat(c, new Date(now))               // preview[Rating.Good].card.due
const { card, log } = f.next(c, new Date(now), Rating.Good)
const r = f.get_retrievability(card, new Date(now), false) // number 0–1
const prev = f.rollback(card, log)                        // annulation
const { collections, reschedule_item } = f.reschedule(createEmptyCard(), history) // history: { rating, review: Date }[]
// carte finale : reschedule_item?.card ; journaux : collections[i].log
```

- `State`: `New=0, Learning=1, Review=2, Relearning=3` ; `Rating`: `Again=1, Hard=2, Good=3, Easy=4`. Nos types `CardState` et `Rating` utilisent les mêmes entiers : pas de table de correspondance.
- Dates : la base stocke des `number` (ms) ; convertir en `Date` uniquement dans `scheduler/fsrs.ts`.
- `elapsed_days` et `last_elapsed_days` sont dépréciés (retirés en ts-fsrs 6) : ne pas s'appuyer dessus, recalculer depuis `lastReview` si besoin.
- Valider les paramètres venant d'une sauvegarde avant `fsrs()` (21 nombres finis, rétention dans [0,7 ; 0,99]).
- `enable_fuzz` rend `preview` légèrement aléatoire : les tests passent `enable_fuzz: false` ou comparent avec une tolérance.

## 3. Leitner Memory Box — invariants

- Compartiments 1–7 ; `intervals = [1, 2, 7, 30, 90, 180, 365]` en mode `interval` ; règles calendaires en mode `calendar` (table dans `docs/03-SCHEDULING.md` §3.2).
- Oublié → C1 ; Réussi → +1 ; Sûr → +2 ; plafond C7 ; C7 réussie reste en C7.
- Nouvelle carte : premier succès → C2 ; premier échec → C1.
- `alternateSides` : bascule `sideFlipped` à chaque succès uniquement.
- Échec re-présenté dans la séance après ≥ 10 cartes ; chaque réponse journalisée.
- `retrievability()` renvoie `null` ; les stats de rétention réelle viennent du journal (`stateBefore = Review`).

## 4. File du jour — ordre canonique

1. Apprentissage dû (par `due`) → 2. Révisions en retard (R croissante / box croissante) → 3. Révisions du jour (aléatoire stable) → 4. Nouvelles (plafond, ordre du paquet), insérées tous les *k* items. Round-robin entre paquets ; sœurs (`noteId`) espacées de ≥ 10 positions ; cartes `suspended`/`retired` exclues ; jour à `dayStartHour` (04:00).

## 5. Anti-patterns à refuser

- Un mode « Apprendre » qui n'est que de la reconnaissance (QCM, appariement chronométré).
- Une pénalité sur les retards, un compteur de « série » (streak), des points.
- Supprimer ou modifier une ligne de `reviews` en dehors de `rollback`.
- Une échéance calculée pour tout un paquet à la fois.
- Afficher la récupérabilité ou la stabilité sans explication en langage courant (réservé à « Infos »).
