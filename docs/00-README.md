# Documentation du projet Recto

Ordre de lecture pour un développeur (humain ou Claude Code) qui arrive sur le projet :

| Fichier | Contenu | Quand le lire |
|---|---|---|
| `01-SPEC.md` | Cahier des charges : vision, principes non négociables (P1–P11), périmètre, exigences | Toujours, en premier |
| `02-DATA-MODEL.md` | Schéma Dexie, types, invariants, format de sauvegarde | Avant tout code touchant la base |
| `03-SCHEDULING.md` | FSRS via ts-fsrs, Leitner Memory Box, file du jour | Avant M2, et pour toute question d'échéance |
| `04-UI.md` | Routes, parcours, textes français, design, accessibilité | Avant tout écran |
| `05-IMPORT-EXPORT.md` | CSV, `.apkg`, sauvegarde | Avant M3 et M4 |
| `06-PWA-QUALITY.md` | PWA, stockage, outils, tests, conventions, déploiement | Avant M0, et à chaque `npm run verify` |
| `07-ROADMAP.md` | Jalons M0–M6 et critères d'acceptation | Au début de chaque session |
| `08-DECISIONS.md` | ADR : pourquoi ces choix, versions épinglées | Quand on est tenté de changer une brique |
| `STATUS.md` | Journal vivant : jalon en cours, fait / reste / décisions / écarts | À chaque début et fin de session (créé en M0) |

Le dossier de recherche complet (état de l'art, audit des applications, méthode Olicard) est `Dossier-Flashcards.html` à la racine ; les règles qui en découlent sont résumées dans `.claude/skills/srs-rules/SKILL.md`.

Règle de cohérence : si un document contredit un autre, l'ordre de priorité est `01` puis numéros croissants ; signaler la contradiction dans `STATUS.md` plutôt que de la résoudre en silence.
