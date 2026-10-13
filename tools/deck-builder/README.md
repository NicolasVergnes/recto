# Plugin « recto-deck-builder »

Plugin Claude (application bureau, claude.ai ou Claude Code) qui crée des paquets de flashcards **clé en main** au format `.apkg`, importables dans Recto (Importer › Paquet Anki) et dans Anki. Il est autonome : il n'a pas besoin du dépôt.

## Contenu

- `.claude-plugin/plugin.json` : manifeste.
- `skills/deck-builder/SKILL.md` : la démarche, le choix du type de note, les règles de qualité des cartes, la livraison.
- `skills/deck-builder/reference/` : `api.md` (la bibliothèque) et `medias.md` (images, sons, formules, occlusion).
- `skills/deck-builder/scripts/recto_apkg.py` : bibliothèque Python (bibliothèque standard seulement) qui écrit le `.apkg` sous la forme exacte de l'export de Recto et le vérifie selon les règles de son importeur ; `python recto_apkg.py check x.apkg` vérifie un paquet existant.
- `skills/deck-builder/examples/exemple.py` : un paquet qui utilise chaque type de note (personnalisé avec images, basique, question, texte à trous, occlusion).

Ce que le paquet peut contenir : notes basiques (posées dans les deux sens), questions à sens unique, texte à trous, occlusion d'image (masques et réponses), types de notes personnalisés (plusieurs champs, une carte par modèle, chaque carte posée dans un seul sens, « A → B », ou dans les deux, « A ↔ B » : une seule carte qui alterne), images, sons, formules, sous-paquets, tags, cartes suspendues. Ce qui reste un réglage de Recto : le planificateur (choisi à l'import) et les réglages de paquet.

## Garanties

`tests/unit/deck-builder-plugin.test.ts` exécute l'exemple et des paquets construits à la volée avec Python 3, puis les lit avec l'importeur `.apkg` de Recto : types de notes, cartes, masques, médias, réimportation d'un paquet régénéré (mise à jour sans doublon), refus de ce qui ne s'importerait pas comme voulu. Si l'import `.apkg` de Recto change (`docs/05-IMPORT-EXPORT.md` §2), ce test le signale : mettre à jour la bibliothèque et `SKILL.md`, puis refaire le zip.

## Fabriquer le zip et l'installer

```
npm run plugin:zip        # écrit tools/deck-builder/recto-deck-builder.zip
```

Téléverser `recto-deck-builder.zip` dans l'application Claude (Paramètres › Capacités ou Plugins, selon la version ; l'exécution de code doit être activée), puis demander par exemple : « Crée un paquet sur les départements français : note avec carte, nom, numéro, préfecture ; cartes Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture ».
