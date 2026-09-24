# Prompts à coller dans Claude Code

Pré-requis sur votre PC : Node.js ≥ 20 (22 recommandé), Git, Claude Code installé. Ouvrez un terminal dans `D:\Documents\Dev\FlashCards`, lancez `git init` si ce n'est pas fait, puis `claude`.

**Étape 0 (une fois)** : le dossier `.claude/` n'a pas pu être écrit à distance ; renommez `_claude-config` en `.claude` (PowerShell : `Rename-Item _claude-config .claude`, ou dans l'Explorateur). Vous devez obtenir `.claude\settings.json` et `.claude\skills\<nom>\SKILL.md`.

Le dossier contient alors `CLAUDE.md`, `.claude/settings.json`, `.claude/skills/*`, `docs/*`, `data/samples/*` et `Dossier-Flashcards.html`. Claude Code lit `CLAUDE.md` automatiquement et charge les skills à la demande.

---

## Session 1 — M0 (squelette)

```
Lis CLAUDE.md, docs/00-README.md, docs/01-SPEC.md, docs/06-PWA-QUALITY.md, docs/07-ROADMAP.md et docs/08-DECISIONS.md, puis charge les skills quality-gate et svelte5-conventions.

Réalise le jalon M0 de docs/07-ROADMAP.md dans ce dépôt (le projet Vite doit être créé à la racine, pas dans un sous-dossier ; conserve les fichiers existants : CLAUDE.md, .claude/, docs/, data/, Dossier-Flashcards.html).

Avant de coder : crée docs/STATUS.md à partir du modèle du skill quality-gate, écris-y ton plan en 5 à 10 étapes, crée la branche m0-scaffold. Vérifie les versions réellement installées et note tout écart avec l'ADR-007 dans STATUS.md.

Termine par npm run verify vert, CHANGELOG.md, STATUS.md à jour et un commit. Ne fusionne pas sur main. Résume en 5 lignes ce que je dois vérifier à la main.
```

## Session 2 — M1 (données et création de cartes)

```
Lis docs/STATUS.md, CLAUDE.md, docs/02-DATA-MODEL.md, docs/04-UI.md et le jalon M1 de docs/07-ROADMAP.md ; charge les skills dexie-local-first, svelte5-conventions, srs-rules et quality-gate.

Réalise M1 sur la branche m1-data-editor, en partant de main (M0 fusionné). Écris les tests des invariants et de la migration avec le code. Termine par la procédure quality-gate.
```

## Session 3 — M2 (planificateurs et révision)

```
Lis docs/STATUS.md, docs/03-SCHEDULING.md, docs/04-UI.md §2.2 et le jalon M2 ; charge srs-rules, svelte5-conventions, dexie-local-first, quality-gate.

Réalise M2 sur la branche m2-scheduling-review. Commence par scheduler/leitner.ts et ses tests (toutes les transitions, les deux modes, la table isBoxDue sur deux ans), puis scheduler/fsrs.ts (adaptateur ts-fsrs, enable_fuzz désactivé dans les tests), puis queue/, puis l'écran de révision. Couverture ≥ 90 % sur scheduler et queue. Termine par la procédure quality-gate.
```

## Sessions suivantes

Même modèle : `Lis docs/STATUS.md et le jalon M<N> ; charge les skills pertinents ; réalise M<N> sur la branche m<N>-<slug> ; termine par la procédure quality-gate.`

- M3 : `docs/05-IMPORT-EXPORT.md` §1 et §3, fixtures `data/samples/*.csv`.
- M4 : `docs/05-IMPORT-EXPORT.md` §2, fixture `data/samples/sample-legacy.apkg` (voir `data/samples/README.md`).
- M5 : SPEC §5.6 (statistiques), accessibilité, performance, déploiement.

## Entre deux sessions (vous)

1. `git log --oneline` et `git diff main...m<N>-<slug> --stat` pour voir l'étendue.
2. `npm run dev`, tester à la main ce que STATUS.md liste dans « À vérifier manuellement ».
3. Si c'est bon : `git checkout main && git merge --squash m<N>-<slug> && git commit -m "feat: M<N> <slug>"`.
4. Sinon, relancer Claude Code avec la liste des corrections, sur la même branche.

## Si Claude Code bloque ou dérive

- « Relis docs/01-SPEC.md §4 (principes P1–P11) et vérifie que ton implémentation les respecte ; liste les écarts avant de continuer. »
- « Tu ajoutes une dépendance qui n'est pas dans docs/08-DECISIONS.md : justifie-la en ADR ou trouve une solution sans. »
- « Ne désactive pas ce test/cette règle ; corrige la cause et explique-la dans STATUS.md. »
- « Le jalon est trop gros pour une session : découpe-le en M<N>a et M<N>b dans STATUS.md et livre M<N>a complet et vert. »

---

## Variante : session Claude Code cloud (claude.ai/code)

Une fois le dépôt poussé sur GitHub :

1. https://claude.ai/code → connecter GitHub (installer l'app GitHub « Claude » sur le dépôt si privé).
2. Environnement **Default** : accès réseau « Trusted » (npm autorisé) ; setup script `npm ci` (utile à partir de M1, quand `package.json` existe) ; aucune variable nécessaire.
3. Choisir le dépôt et la branche `main`, mode « Accept edits » (ou « Auto » pour M0, qui ne fait que créer des fichiers), coller le prompt de la session voulue.
4. Claude Code lit `CLAUDE.md`, `.claude/settings.json` et `.claude/skills/` du dépôt (un seul dépôt par session, sinon `settings.json` est ignoré). Il travaille sur une branche `m<N>-<slug>`, la pousse, et propose « Create PR » : relisez la PR, fusionnez en squash sur `main`.
5. Depuis le terminal, l'équivalent est `claude --cloud "…prompt…"`, et `claude --teleport <id>` ramène une session cloud en local.

Limites du cloud : pas d'affichage (Playwright en headless seulement, ce qui suffit pour `npm run e2e`), sessions arrêtées après inactivité (rouvrables), test d'installation Android à faire vous-même depuis l'URL de déploiement.
