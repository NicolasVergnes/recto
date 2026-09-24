# Recto

Application de flashcards à répétition espacée : locale-first, hors ligne, sans compte ni serveur. Deux planificateurs : FSRS-6 et la boîte à sept compartiments de la « Memory Box ». Import CSV et Anki (`.apkg`), sauvegarde complète en un clic.

Statut : **kit de démarrage** — le code n'est pas encore écrit. Si un dossier `_claude-config/` est présent, renommez-le en `.claude/` avant de lancer Claude Code. Voir `PROMPT-KICKOFF.md` pour lancer le développement avec Claude Code, `docs/00-README.md` pour la documentation, `Dossier-Flashcards.html` pour la recherche qui fonde le projet.

## Contenu du dépôt

```
CLAUDE.md                 instructions pour Claude Code (lues automatiquement)
PROMPT-KICKOFF.md         prompts à coller, session par session
.claude/settings.json     permissions Claude Code (npm, git local ; push/merge interdits)
.claude/skills/           srs-rules · svelte5-conventions · dexie-local-first · quality-gate
docs/                     cahier des charges 01–08 (+ STATUS.md créé en M0)
data/samples/             jeux d'essai CSV et .apkg
Dossier-Flashcards.html   état de l'art, méthode Olicard, audit des applications
```

## Après M0

```
npm install
npm run dev        # http://localhost:5173
npm run verify     # porte de qualité complète
```
