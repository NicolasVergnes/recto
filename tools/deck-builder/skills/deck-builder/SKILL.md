---
name: deck-builder
description: Crée un paquet de flashcards clé en main (.apkg) pour l'application Recto, rédigé selon ce que la recherche sur la mémoire impose au format d'une carte (rappel actif, une information par carte, trous courts, image-indice, deux sens seulement si la relation est symétrique) — types de notes à plusieurs champs et plusieurs cartes, images, sons, texte à trous, séquences, occlusion d'image, formules. À utiliser dès que l'utilisateur demande des cartes, des flashcards, un paquet, un deck ou des fiches de révision, à partir d'un sujet, d'un cours, d'un PDF, d'images ou de notes, ou veut importer des cartes dans Recto.
---

# Paquets clé en main pour Recto

Tu livres un fichier **`.apkg`** que l'utilisateur importe dans Recto (Importer → Paquet Anki), sur ordinateur ou téléphone. Recto est une application de flashcards à répétition espacée, en français, sans serveur. **Clé en main** veut dire deux choses : tout ce que l'utilisateur ferait à la main dans Recto (type de note, champs, cartes dans chaque sens, images, sons, masques d'occlusion, sous-paquets, tags), le paquet le contient déjà ; et chaque carte est **rédigée dans le format que la recherche montre efficace** (`reference/format-cartes.md`), pas seulement importable. Ne lui demande jamais de finir à la main ce que la bibliothèque sait faire.

Outils de ce skill (même dossier que ce fichier ; si tu ne le trouves pas : `find / -name recto_apkg.py -path "*deck-builder*" 2>/dev/null`) :

- `scripts/recto_apkg.py` : bibliothèque Python (bibliothèque standard seulement) qui écrit le `.apkg` sous la forme exacte que Recto relit, le vérifie, et **relit chaque carte à l'aune de la charte** (avertissements « charte Rn »). **Seule façon d'écrire le paquet** : pas de `.apkg` écrit à la main, pas de genanki, pas de CSV (le CSV ne porte ni types de notes, ni médias).
- `reference/format-cartes.md` : **la charte de rédaction** (R1-R13, sources, formats par sujet, avant/après, grille de relecture). À lire avant de rédiger la première carte.
- `reference/api.md` : l'API, avec un exemple complet de type à plusieurs cartes.
- `reference/medias.md` : images, sons, formules, masques d'occlusion. À lire dès qu'un média est en jeu.
- `examples/exemple.py` : un paquet qui utilise chaque type de note ; `examples/charte.py` : un paquet qui applique la charte sujet par sujet (vocabulaire, dates, séquence, concepts, indices). Les lire avant d'écrire le tien.

## Démarche

1. **Cadrer.** Si la demande décrit déjà la note et ses cartes (« note avec Carte, Nom, Numéro ; cartes Carte → Nom, Nom ↔ Numéro »), c'est la spécification : la suivre exactement, sans la simplifier. Sinon, une seule question groupée : sujet et source, ce qu'il faut savoir faire (dans quel sens, pour quel usage), médias souhaités, nombre de cartes, nom du paquet. À défaut de réponse : 20 à 40 notes, choix raisonnables, annoncés.
2. **Choisir les types de notes** (tableau ci-dessous) et, pour le sujet, le format recommandé dans `format-cartes.md` § « Formats par sujet ». Un paquet peut mélanger plusieurs types.
3. **Réunir les faits.** Partir de la source fournie, la comprendre avant de découper (R2). Ne rien inventer : un fait tiré de ta mémoire est signalé comme tel à la livraison ; si le réseau est disponible, vérifier les faits incertains sur une source de référence et la citer (champ `Source`, `source=` ou `Extra`). Dater dans la question les faits qui changent (R13).
4. **Rédiger selon la charte** : une information par carte, questions télégraphiques, jamais de oui/non ni de QCM, pas de liste de plus de 4 éléments (séquences en `add_sequence`), trous courts, image-indice muette, deux sens seulement si chaque face est une étiquette à réponse unique, indices `pendu()` pour les réponses difficiles, cartes « pourquoi / comment » dans un paquet de concepts. Le résumé est plus bas ; le détail, les exemples et les pièges par sujet sont dans `reference/format-cartes.md`.
5. **Produire les médias** (`reference/medias.md`) : générés (schémas, cartes, drapeaux, graphiques), téléchargés si le réseau et la licence le permettent, ou fournis par l'utilisateur. Regarder soi-même 2 ou 3 images produites avant de continuer : rien d'écrit sur l'image qui donne la réponse.
6. **Écrire le script de construction** (`construire_paquet.py`) avec la bibliothèque, l'exécuter. `Package.write()` vérifie le paquet comme Recto l'importera et **refuse d'écrire** ce qui ne s'importerait pas comme voulu : corriger jusqu'à « OK : importable dans Recto ».
7. **Relire le rapport** : l'aperçu montre la première note de chaque type, carte par carte (question | réponse) ; chaque carte doit avoir du sens seule, dans son sens. Puis la section **« Charte de rédaction »** : chaque avertissement « charte Rn » se corrige (reformuler, découper, changer de type), ou se garde avec une raison écrite dans le message de livraison. Les autres avertissements (balises retirées, images sans `alt`, champs longs) se traitent de même. Dérouler la grille de relecture de `format-cartes.md` sur l'aperçu.
8. **Livrer** le `.apkg` et le script de construction (il permet de corriger puis de régénérer), avec le message de livraison ci-dessous.

## Choisir le type de note

| Besoin | Méthode | Ce que Recto en fait |
|---|---|---|
| Paire symétrique : mot ↔ traduction, terme ↔ symbole, nom ↔ numéro, événement ↔ date unique | `add_basic` | Une carte, posée dans un sens puis dans l'autre (le paquet alterne après chaque réussite, réglage par défaut) ; chaque face est une étiquette (« Terre : périmètre » ↔ « 40 075 km ») |
| Question à sens unique : pourquoi, comment, différence, exemple ; relation non symétrique (plante → famille) ; réponse qui est une explication courte | `add_question` | Une carte, jamais retournée ; explication et source sous la réponse |
| Phrase, définition, date, formule à compléter | `add_cloze` | Une carte par numéro de trou (`{{c1::…}}`, `{{c2::…}}`) ; indice `{{c1::réponse::indice}}` |
| Liste **ordonnée** : planètes, couches, étapes, dynastie | `add_sequence` | Une note à trous par élément, qui ne montre que ses voisins et son rang (trous chevauchants) |
| Image légendée : anatomie, carte, schéma, plan, tableau | `add_occlusion` | Une carte par groupe de masques, la zone cachée à retrouver |
| Un objet à plusieurs facettes demandé dans des directions précises : département (carte, nom, numéro, préfecture), mot (son, image, traduction, genre), œuvre (image, titre, auteur, date), plante (photos, nom, famille) | `note_type` + `add_note` | Type de note personnalisé : un champ par facette, **une carte par modèle** : `one_way` pour « A → B » (toujours posée ainsi), `two_way` pour « A ↔ B » (**une seule carte**, posée dans un sens puis dans l'autre ; seulement si chaque face a une réponse unique) |

Types personnalisés, l'essentiel (détail dans `reference/api.md`) :

- **Champs** : noms uniques, sans `{ } : "`, ne commençant pas par `# ^ /`. Le premier champ identifie la note (doublons, réimportation) : le choisir stable (nom, numéro, image), ou passer `guid=`.
- **Sens des cartes, à respecter à la lettre** : « A → B » est une carte toujours posée dans ce sens : `one_way(nom, question, réponse)`. « A ↔ B » est **une seule carte** qui peut être posée dans un sens ou dans l'autre (la face 1 d'abord, la face 2 après une réussite, comme une note basique) : `two_way(nom, face1, face2)`, jamais deux modèles A → B et B → A. Exemple : « Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture » = 3 modèles, donc 3 cartes par note. Un `two_way` dont la face 2 se répète d'une note à l'autre (Nom ↔ Région) est ambigu dans le sens inverse : `one_way`. Recto n'affiche pas le nom du modèle en révision : **chaque face dit ce qu'on cherche** de l'autre côté (`<b>{{Nom}}</b><br><i>numéro ?</i>` ↔ `<b>{{Numéro}}</b><br><i>département ?</i>`), sinon deux cartes d'une note posent la même face « Bas-Rhin » sans dire quoi trouver (signalé).
- **Modèles** : `one_way(nom, question, réponse)` (la réponse reprend la question par `{{FrontSide}}<hr id=answer>`), `two_way(nom, face1, face2)` (chaque face s'écrit seule, sans `{{FrontSide}}` ; la carte n'existe que si les deux faces ont un contenu). Syntaxe : `{{Champ}}`, `{{#Champ}}…{{/Champ}}` (seulement si le champ est rempli), `{{^Champ}}…{{/Champ}}` (s'il est vide), `{{text:Champ}}`, `{{type:Champ}}` (le champ attendu quand le paquet a la réponse tapée). Une note n'a pas la carte d'un modèle dont la question serait vide ou identique pour toutes les notes.
- **Mise en forme** : `<br>`, `<b>`, `<i>`, `<u>`, `<sub>`, `<sup>`, `<ul>/<ol>/<li>`, `<p>`, `<hr id=answer>`. Recto retire tout le reste à l'affichage (`<div>` : le texte reste mais sans retour à la ligne ; `style` et CSS : ignorés).
- Au plus 3 champs avec un seul modèle qui demande le 1er champ (ou deux modèles : le 1er puis le 2e) : Recto en ferait une note basique. La bibliothèque le refuse : `add_basic` (une paire A ↔ B seule), ou un champ de plus (`Source`, `Continent`, `Région`).
- Un texte à trous ne vit pas dans un type personnalisé : `add_cloze` (champs Texte et Extra).

## La charte en treize règles (détail, sources et exemples : `reference/format-cartes.md`)

| # | Règle | En pratique |
|---|---|---|
| R1 | Une information par carte | Réponse ≤ 25 mots ; le reste dans `Extra` / `Explication` ; découper ou passer en trous |
| R2 | Comprendre avant de mémoriser | Partir d'une source comprise ; dans un paquet de concepts, 1 `add_question` « pourquoi / comment / différence / exemple » pour 5 à 10 cartes de faits |
| R3 | Formulation télégraphique | « Sujet : attribut » → valeur (« Australie : capitale » → « Canberra ») ; une seule phrase interrogative pour `add_question` |
| R4 | Rappel, pas reconnaissance | Jamais de QCM, vrai/faux, « est-ce que », oui/non, « décris », « parle-moi de » : demander la valeur |
| R5 | Une seule bonne réponse, sans la montrer | Contexte dans la question ; la question ne contient pas la réponse ni une autre facette qui la donne ; distinguer les voisines qui se ressemblent |
| R6 | Pas de listes | Ensemble : une carte par élément ou groupes de 4 au plus ; séquence : `add_sequence` |
| R7 | Trous courts dans un contexte qui questionne | Un trou = un mot, un nombre, une expression ; jamais la phrase entière ; formule entière |
| R8 | Image = indice, pas béquille | Image muette dans la question, `alt` qui ne nomme pas la réponse ; image en réponse seulement si c'est l'objet à produire (signe LSF) |
| R9 | Deux sens si symétrique, un sens sinon | `add_basic` / `two_way` : deux faces-étiquettes à réponse unique, jamais « … ? » ; sinon `add_question` / `one_way` |
| R10 | Réussissable (réussite initiale > 50 %) | Indice qui ne donne pas la réponse : `pendu("1515")` → « 1 _ _ _ », catégorie, `{{c1::…::indice}}` ; dans un sens unique seulement |
| R11 | Mnémotechnie et balises dans Extra | « Astuce : VIBUJOR » après la réponse, jamais dans la question |
| R12 | Prioriser, pas de mini-paquets | 20-40 notes ; cartes secondaires en `suspended=True` + tag `bonus` ; sous-paquets d'au moins ~20 cartes |
| R13 | Précision, date, source | Faits volatils datés dans la question ; faits incertains sourcés ou signalés |

Et toujours : les cartes d'une même note sont mélangées par Recto, ne pas s'en soucier ; dans un `two_way`, chaque face se suffit comme question et dit ce qu'on cherche (« Ain / numéro ? » ↔ « 01 / département ? », pas « Quel est le numéro de l'Ain ? » ↔ « 01 »).

## Ce qui se règle dans Recto (pas dans le paquet)

- À l'import, l'utilisateur choisit le planificateur des paquets créés : FSRS (défaut) ou Memory Box (boîte à 7 compartiments).
- Les réglages d'un paquet (nouvelles cartes par jour, rétention, alternance des faces, réponse tapée pour les notes basiques, lecture automatique des sons) ne voyagent pas dans un `.apkg` : n'en parler que si le paquet en a besoin, en une ligne précise (« Paquet Vocabulaire › Paramètres : activer la lecture automatique des sons »). La réponse tapée s'active toujours dans les réglages du paquet (« Réponse tapée ») ; `{{type:Champ}}` désigne seulement le champ attendu par une carte `one_way`.
- Sous-paquets : un niveau (`Matière::Chapitre`) ; au-delà, Recto aplatit le nom.
- **Régénérer un paquet corrigé** : même nom de type, mêmes champs, même premier champ (ou même `guid=`) → Recto met à jour les notes au lieu de les dupliquer et garde la progression. Changer les champs ou les modèles d'un type existant n'est pas repris par une réimportation : le dire si c'est le cas.
- Retirer une carte acquise, suspendre, régler la rétention : c'est Recto (principes P6, P7, P9) ; ne pas écrire de consigne de ce genre dans les cartes.

## Message de livraison

En 5 à 10 lignes :

- le fichier, et ce qu'il contient : paquets, types de notes (cartes par note), nombre de notes, de cartes et de médias ;
- **les choix de format** en une ligne (sens des cartes, séquences, indices, cartes de raisonnement) et les avertissements « charte » gardés, avec leur raison ;
- **les points à vérifier** : faits tirés de ta mémoire ou incertains, choix discutables (ex. « Cergy » plutôt que « Cergy-Pontoise »), cartes suspendues (`bonus`) ;
- l'import : Recto → Importer → Paquet Anki (.apkg) → choisir le fichier (Google Drive est accessible depuis le sélecteur du téléphone) → planificateur → Importer ;
- les réglages de paquet à faire dans Recto, seulement s'il y en a.

Ne jamais écrire « importé » : tu livres le fichier, l'utilisateur l'importe.
