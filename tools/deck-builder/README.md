# Plugin « recto-deck-builder »

Plugin Claude (application bureau, claude.ai ou Claude Code) qui crée des paquets de flashcards **clé en main** au format `.apkg`, importables dans Recto (Importer › Paquet Anki) et dans Anki, et **rédigés selon la charte issue de la recherche sur la mémoire** (`reference/format-cartes.md`). Il est autonome : il n'a pas besoin du dépôt.

## Contenu

- `.claude-plugin/plugin.json` : manifeste.
- `skills/deck-builder/SKILL.md` : la démarche, le choix du type de note, la charte en treize règles, la livraison.
- `skills/deck-builder/reference/` : `format-cartes.md` (la charte : règles R1-R13 sourcées — Wozniak 1999, Olicard 2018, Rowland 2014, Carpenter & Olson 2012, Kornell 2009… —, formats par sujet, avant/après, grille de relecture), `api.md` (la bibliothèque) et `medias.md` (images, sons, formules, occlusion).
- `skills/deck-builder/scripts/recto_apkg.py` : bibliothèque Python (bibliothèque standard seulement) qui écrit le `.apkg` sous la forme que l'importeur de Recto reconnaît (celle de son ancien export, retiré en M18), le vérifie selon les règles de son importeur, et relit chaque carte à l'aune de la charte (avertissements « charte Rn », non bloquants) ; `python recto_apkg.py check x.apkg` vérifie un paquet existant. Aides de rédaction : `add_sequence()` (liste ordonnée en trous chevauchants), `pendu()` (indice récupérateur « 1 _ _ _ »).
- `skills/deck-builder/examples/exemple.py` : un paquet qui utilise chaque type de note (personnalisé avec images, basique, question, texte à trous, occlusion) ; `examples/charte.py` : un paquet qui applique la charte sujet par sujet (sans aucun avertissement).

Ce que le paquet peut contenir : notes basiques (posées dans les deux sens), questions à sens unique, texte à trous, séquences, occlusion d'image (masques et réponses), types de notes personnalisés (plusieurs champs, une carte par modèle, chaque carte posée dans un seul sens, « A → B », ou dans les deux, « A ↔ B » : une seule carte qui alterne), images, sons, formules, sous-paquets, tags, cartes suspendues. Ce qui reste un réglage de Recto : le planificateur (choisi à l'import) et les réglages de paquet.

Ce que la charte impose aux cartes (détail et sources dans `format-cartes.md`) : une information par carte ; rappel actif, jamais de QCM, de vrai/faux ni de oui/non ; une seule bonne réponse, jamais montrée dans la question ; pas de liste de plus de 4 éléments (séquences en trous chevauchants) ; trous courts dans un contexte qui questionne ; image comme indice, muette, `alt` qui ne nomme pas la réponse ; deux sens seulement si chaque face est une étiquette à réponse unique ; indices récupérateurs plutôt que cartes impossibles ; mnémotechnie dans Extra ; 20 à 40 notes priorisées ; faits volatils datés.

## Garanties

`tests/unit/deck-builder-plugin.test.ts` exécute les exemples et des paquets construits à la volée avec Python 3, puis les lit avec l'importeur `.apkg` de Recto : types de notes, cartes, masques, médias, réimportation d'un paquet régénéré (mise à jour sans doublon), refus de ce qui ne s'importerait pas comme voulu, absence d'avertissement « charte » sur `charte.py` et présence sur des cartes qui enfreignent la charte. Si l'import `.apkg` de Recto change (`docs/05-IMPORT-EXPORT.md` §2), ce test le signale : mettre à jour la bibliothèque et `SKILL.md`, puis refaire le zip.

## Fabriquer le zip et l'installer

```
npm run plugin:zip        # écrit tools/deck-builder/recto-deck-builder.zip
```

Téléverser `recto-deck-builder.zip` dans l'application Claude (Paramètres › Capacités ou Plugins, selon la version ; l'exécution de code doit être activée), puis demander par exemple : « Crée un paquet sur les départements français : note avec carte, nom, numéro, préfecture ; cartes Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture ».
