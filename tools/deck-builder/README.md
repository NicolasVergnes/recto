# Plugin « recto-deck-builder »

Plugin Claude (application bureau ou Claude Code) qui crée des paquets de flashcards au format CSV importable dans Recto. Il est autonome : il n'a pas besoin du dépôt.

## Contenu

- `.claude-plugin/plugin.json` — manifeste.
- `skills/deck-builder/SKILL.md` — la procédure et toutes les règles (cartes atomiques, format CSV, cloze, formules).
- `skills/deck-builder/scripts/check_deck.py` — vérifie un CSV avant livraison (Python 3, bibliothèque standard).
- `skills/deck-builder/examples/` — `basique.csv`, `cloze.csv`, `mixte.csv`, relus par le vrai parseur de Recto (`tests/unit/deck-builder-plugin.test.ts`).

## Fabriquer le zip

```
npm run plugin:zip        # écrit tools/deck-builder/dist/recto-deck-builder.zip
```

## Installer dans l'application Claude

Téléverser `recto-deck-builder.zip` dans l'application (Paramètres → Plugins / Capacités, selon la version), puis demander par exemple : « Fais-moi un paquet de 30 cartes sur … ». Le plugin doit rester synchronisé avec `docs/05-IMPORT-EXPORT.md` §1 : si le format CSV de Recto change, mettre à jour `SKILL.md`, les exemples (le test échouera) et relancer `npm run plugin:zip`.
