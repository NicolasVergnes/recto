# Plugin « recto-deck-builder »

Plugin Claude (application bureau, claude.ai ou Claude Code) qui crée des paquets de flashcards **clé en main** au format **paquet Recto** (`.rpkg`, depuis la version 3.0.0), importables dans Recto (Importer › Paquet Recto), et **rédigés selon la charte issue de la recherche sur la mémoire** (`reference/format-cartes.md`). Il est autonome : il n'a pas besoin du dépôt.

## Contenu

- `.claude-plugin/plugin.json` : manifeste.
- `skills/deck-builder/SKILL.md` : la démarche, le choix du type de note, la charte en treize règles, la livraison.
- `skills/deck-builder/reference/` : `format-cartes.md` (la charte : règles R1-R13 sourcées — Wozniak 1999, Olicard 2018, Rowland 2014, Carpenter & Olson 2012, Kornell 2009… —, formats par sujet, avant/après, grille de relecture), `api.md` (la bibliothèque) et `medias.md` (images, sons, formules, occlusion).
- `skills/deck-builder/scripts/recto_rpkg.py` : bibliothèque Python (bibliothèque standard seulement) qui écrit le `.rpkg` (`docs/05-IMPORT-EXPORT.md` §5 : les notes, types, médias et réglages de paquets sous la forme même que Recto stocke), le vérifie selon les règles de son importeur, et relit chaque carte à l'aune de la charte (avertissements « charte Rn », non bloquants) ; `python recto_rpkg.py check x.rpkg` vérifie un paquet existant. Aides de rédaction : `add_sequence()` (liste ordonnée en trous chevauchants), `pendu()` (indice récupérateur « 1 _ _ _ »).
- `skills/deck-builder/examples/exemple.py` : un paquet qui utilise chaque type de note (personnalisé avec images, basique, question, texte à trous, occlusion) ; `examples/charte.py` : un paquet qui applique la charte sujet par sujet (sans aucun avertissement).

Ce que le paquet peut contenir : notes basiques (posées dans les deux sens), questions à sens unique, texte à trous, séquences, occlusion d'image (masques et réponses), types de notes personnalisés (plusieurs champs, une carte par modèle, chaque carte posée dans un seul sens, « A → B », ou dans les deux, « A ↔ B » : une seule carte qui alterne), images, sons, formules, sous-paquets, tags, cartes suspendues, réglages et description des paquets (nouvelles cartes par jour, réponse tapée, formats introduits plus tard…). Ce qui reste un réglage de Recto : le planificateur (choisi à l'import) et la rétention.

Depuis la 3.0.0, le plugin n'écrit plus de `.apkg` (Recto ne relit plus ses contournements : marque « deux sens », réponses des masques dans « Comments », type « Recto · Question »). Les guid sont les mêmes qu'avant : régénérer en `.rpkg` un paquet importé en `.apkg` met à jour ses notes basiques, à trous et d'occlusion, sans doublon. Les questions (devenues des notes Basique à sens unique) et les notes de types personnalisés (leur type importé d'Anki n'est pas celui du paquet Recto) gardent leur version importée : ni mises à jour ni dupliquées. Pour les remplacer, supprimer le paquet (et son type) dans Recto, puis importer le `.rpkg`.

Ce que la charte impose aux cartes (détail et sources dans `format-cartes.md`) : une information par carte ; rappel actif, jamais de QCM, de vrai/faux ni de oui/non ; une seule bonne réponse, jamais montrée dans la question ; pas de liste de plus de 4 éléments (séquences en trous chevauchants) ; trous courts dans un contexte qui questionne ; image comme indice, muette, `alt` qui ne nomme pas la réponse ; deux sens seulement si chaque face est une étiquette à réponse unique ; indices récupérateurs plutôt que cartes impossibles ; mnémotechnie dans Extra ; 20 à 40 notes priorisées ; faits volatils datés.

## Garanties

`tests/unit/deck-builder-plugin.test.ts` exécute les exemples et des paquets construits à la volée avec Python 3, puis les lit avec l'importeur `.rpkg` de Recto : types de notes, cartes, masques, médias, réimportation d'un paquet régénéré (mise à jour sans doublon), refus de ce qui ne s'importerait pas comme voulu, absence d'avertissement « charte » sur `charte.py` et présence sur des cartes qui enfreignent la charte. Si l'import `.rpkg` de Recto change (`docs/05-IMPORT-EXPORT.md` §5), ce test le signale : mettre à jour la bibliothèque et `SKILL.md`, puis refaire le zip.

## Fabriquer le zip et l'installer

```
npm run plugin:zip        # écrit tools/deck-builder/recto-deck-builder.zip
```

Téléverser `recto-deck-builder.zip` dans l'application Claude (Paramètres › Capacités ou Plugins, selon la version ; l'exécution de code doit être activée), puis demander par exemple : « Crée un paquet sur les départements français : note avec carte, nom, numéro, préfecture ; cartes Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture ».
