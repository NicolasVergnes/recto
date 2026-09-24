---
name: quality-gate
description: Procédure de fin de jalon pour Recto — vérifications automatiques (check, lint, format, tests, build, e2e), relecture critique, mise à jour de STATUS.md et CHANGELOG.md, commit. Charger au début de chaque session (pour connaître la cible) et obligatoirement avant de déclarer un jalon terminé.
---

# Porte de qualité (quality-gate)

Un jalon n'est « terminé » que si tout ce qui suit est fait, dans cet ordre. Si une étape échoue, corriger la cause, jamais le contrôle.

## 1. Avant de coder

1. Lire `docs/STATUS.md`, puis les critères d'acceptation du jalon dans `docs/07-ROADMAP.md`.
2. Écrire un plan de 5–10 étapes dans `STATUS.md` (section « Jalon en cours ») ; chaque étape nomme les fichiers et les tests concernés.
3. Créer la branche `m<N>-<slug>` depuis `main`.

## 2. Pendant

- Tests du domaine écrits avec le code ; `npm run test:watch` ouvert.
- Après chaque étape : `npm run check` (types) — ne pas accumuler les erreurs.
- Toute décision non couverte par les docs → `STATUS.md` › « Décisions prises en session » (une ligne : quoi, pourquoi, alternative écartée).

## 3. Vérification automatique

```
npm run verify
```

Attendu : `check` 0 erreur 0 warning · `lint` 0 erreur · `format:check` propre · `test` vert avec couverture ≥ 90 % sur `src/lib/scheduler`, `src/lib/queue`, `src/lib/import` · `build` OK · `e2e` vert.

Si `verify` n'existe pas encore (M0), le créer en premier.

## 4. Relecture critique (à faire soi-même, honnêtement)

Passer le diff (`git diff main...HEAD`) avec cette grille et corriger avant de continuer :

- **Principes P1–P11** : un écran ou une fonction les contourne-t-il ? (verso visible trop tôt, carte supprimable trop tôt, échéance globale, texte en dur non traduit…)
- **Domaine pur** : `scheduler`, `queue`, parsers sans import de Svelte/Dexie/DOM ; `now` en paramètre.
- **Transactions** : chaque écriture multi-tables est atomique ; `reviews` jamais modifié.
- **Cas limites** : paquet vide, 0 nouvelles/jour, carte suspendue, changement de jour à 04:00, heure d'été, fichier vide/corrompu, quota plein.
- **Accessibilité** : clavier seul sur le nouvel écran ; libellés ; focus après action ; contraste.
- **Performance** : pas de requête Dexie dans une boucle ; listes longues virtualisées ; gros modules en `import()`.
- **Sécurité** : HTML des champs passé par `sanitize()` ; noms de fichiers média normalisés ; pas d'`innerHTML` direct.
- **Simplicité** : chaque abstraction ajoutée est utilisée au moins deux fois ; sinon l'inliner.
- **Docs** : si le comportement diffère des docs, mettre à jour la doc (et le dire dans STATUS), pas seulement le code.

## 5. Clôture

1. `CHANGELOG.md` : section `## [Unreleased]` › entrée du jalon (Added/Changed/Fixed).
2. `docs/STATUS.md` : jalon marqué terminé, critères cochés avec la preuve (nom du test ou manipulation), « Reste à faire », « Écarts par rapport aux docs », « Décisions prises en session », versions réellement installées si différentes de l'ADR-007.
3. Commit(s) Conventional Commits en anglais ; message de fin de session qui résume en 5 lignes ce qui a été livré et ce que Nicolas doit vérifier à la main (ex. installation Android).
4. Ne pas fusionner sur `main`.

## 6. Modèle de `docs/STATUS.md`

```markdown
# STATUS — Recto
Dernière mise à jour : AAAA-MM-JJ · Branche : mN-slug · Jalon en cours : MN

## Jalon en cours
Plan : 1. … 2. …
Critères : [x] … (test tests/unit/queue.test.ts › "…") [ ] …

## Terminé
M0 (AAAA-MM-JJ) — résumé en une ligne, lien commit

## Reste à faire / dettes
- …

## Décisions prises en session
- AAAA-MM-JJ : … (pourquoi ; alternative écartée)

## Écarts par rapport aux docs
- …

## À vérifier manuellement par Nicolas
- …
```
