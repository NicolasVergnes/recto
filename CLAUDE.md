# Recto — instructions pour Claude Code

Recto est une PWA de flashcards à répétition espacée, locale-first, sans serveur, pour un seul utilisateur (Nicolas). Interface en français, code en anglais. Stack : Svelte 5 (runes) + Vite 8 + TypeScript strict, Dexie 4, ts-fsrs 5, vite-plugin-pwa.

## Sources de vérité

1. `docs/01-SPEC.md` — cahier des charges, principes P1–P11 (non négociables).
2. `docs/02` à `08` — modèle de données, planification, UI, import/export, qualité, roadmap, ADR.
3. `docs/STATUS.md` — état courant du projet : **le lire en premier à chaque session, le mettre à jour en dernier.**
4. Skills dans `.claude/skills/` : `srs-rules` (pédagogie et ts-fsrs), `svelte5-conventions`, `dexie-local-first`, `quality-gate`. Les charger dès que le sujet est touché.

Ne jamais inventer une exigence : si une question n'a pas de réponse dans les docs, choisir l'option la plus simple compatible avec P1–P11, l'écrire dans `STATUS.md` (section « Décisions prises en session ») et continuer.

## Façon de travailler

- Un jalon (`docs/07-ROADMAP.md`) par session, sur une branche `m<N>-<slug>`. Commencer par relire ses critères d'acceptation, planifier en 5–10 étapes, puis exécuter.
- Écrire les tests du domaine (scheduler, queue, import) **avant ou avec** le code, jamais après coup.
- Terminer par `npm run verify` (doit être vert), une entrée `CHANGELOG.md`, la mise à jour de `docs/STATUS.md`, un commit Conventional Commits. Ne pas fusionner sur `main` : Nicolas relit et fusionne.
- En cas de doute entre deux implémentations, préférer la plus courte et la plus lisible ; pas d'abstraction anticipée.
- Ne jamais ajouter une dépendance non listée dans `docs/08-DECISIONS.md` sans l'inscrire comme nouvelle ADR avec sa justification.
- Ne jamais désactiver une règle de lint, un test ou une vérification de type pour « faire passer » : corriger la cause.
- Ne jamais toucher aux fixtures de `data/samples/` sans mettre à jour les tests qui les lisent.

## Commandes

```
npm run dev            # serveur de dev
npm run check          # svelte-check + tsc
npm run lint           # eslint
npm run format         # prettier --write ; format:check pour vérifier
npm run test           # vitest run ; test:watch en développement
npm run e2e            # playwright test (build + preview automatiques)
npm run build          # build de production dans dist/
npm run verify         # check + lint + format:check + test + build + e2e
npm run icons          # génère les icônes PWA depuis public/logo.svg
```

## Règles de code (résumé ; détail dans les skills)

- Svelte 5 runes uniquement ; aucun `export let`, aucun store legacy, aucun `$:`.
- Le domaine (`src/lib/scheduler`, `queue`, `import/*` parsers, `stats`) est pur : pas de DOM, pas de Dexie, `now` passé en paramètre.
- Toute écriture multi-tables est une transaction Dexie ; le journal `reviews` est append-only.
- Tout texte visible passe par `t('clé')` dans `src/lib/i18n/fr.ts`.
- HTML des champs rendu uniquement via `sanitize()` (dompurify, liste blanche). Seule exception : la sortie de KaTeX, sûre par sa configuration et détruite par `sanitize()` (ADR-009).
- Pas de `any` ; pas de `Date.now()` dans le domaine ; pas de `console.log` en production.
- Accessibilité : chaque contrôle a un libellé texte, chaque image un `alt`, tout est faisable au clavier.

## Ce que le produit ne fait pas (ne pas le proposer)

Comptes, serveur, télémétrie, IA, gamification, notifications push, SM-2. Voir `docs/01-SPEC.md` §2.
