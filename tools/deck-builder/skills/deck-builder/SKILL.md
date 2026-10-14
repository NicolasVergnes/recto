---
name: deck-builder
description: Crée un paquet de flashcards clé en main (.apkg) pour l'application Recto — types de notes à plusieurs champs et plusieurs cartes, images, sons, texte à trous, occlusion d'image, formules. À utiliser dès que l'utilisateur demande des cartes, des flashcards, un paquet, un deck ou des fiches de révision, à partir d'un sujet, d'un cours, d'un PDF, d'images ou de notes, ou veut importer des cartes dans Recto.
---

# Paquets clé en main pour Recto

Tu livres un fichier **`.apkg`** que l'utilisateur importe dans Recto (Importer → Paquet Anki), sur ordinateur ou téléphone. Recto est une application de flashcards à répétition espacée, en français, sans serveur. **Clé en main** veut dire : tout ce que l'utilisateur ferait à la main dans Recto (type de note, champs, cartes dans chaque sens, images, sons, masques d'occlusion, sous-paquets, tags), le paquet le contient déjà. Ne lui demande jamais de finir à la main ce que la bibliothèque sait faire.

Outils de ce skill (même dossier que ce fichier ; si tu ne le trouves pas : `find / -name recto_apkg.py -path "*deck-builder*" 2>/dev/null`) :

- `scripts/recto_apkg.py` : bibliothèque Python (bibliothèque standard seulement) qui écrit le `.apkg` sous la forme exacte que Recto relit, et le vérifie. **Seule façon d'écrire le paquet** : pas de `.apkg` écrit à la main, pas de genanki, pas de CSV (le CSV ne porte ni types de notes, ni médias).
- `reference/api.md` : l'API, avec un exemple complet de type à plusieurs cartes.
- `reference/medias.md` : images, sons, formules, masques d'occlusion. À lire dès qu'un média est en jeu.
- `examples/exemple.py` : un paquet qui utilise chaque type de note ; le lire avant d'écrire le tien.

## Démarche

1. **Cadrer.** Si la demande décrit déjà la note et ses cartes (« note avec Carte, Nom, Numéro ; cartes Carte → Nom, Nom ↔ Numéro »), c'est la spécification : la suivre exactement, sans la simplifier. Sinon, une seule question groupée : sujet et source, ce qu'il faut savoir faire (dans quel sens), médias souhaités, nombre de cartes, nom du paquet. À défaut de réponse : 20 à 40 notes, choix raisonnables, annoncés.
2. **Choisir les types de notes** (tableau ci-dessous). Un paquet peut en mélanger plusieurs.
3. **Réunir les faits.** Partir de la source fournie. Ne rien inventer : un fait tiré de ta mémoire est signalé comme tel à la livraison ; si le réseau est disponible, vérifier les faits incertains sur une source de référence et la citer (champ `Source` ou `Extra`).
4. **Produire les médias** (`reference/medias.md`) : générés (schémas, cartes, drapeaux, graphiques), téléchargés si le réseau et la licence le permettent, ou fournis par l'utilisateur. Regarder soi-même 2 ou 3 images produites avant de continuer.
5. **Écrire le script de construction** (`construire_paquet.py`) avec la bibliothèque, l'exécuter. `Package.write()` vérifie le paquet comme Recto l'importera et **refuse d'écrire** ce qui ne s'importerait pas comme voulu : corriger jusqu'à « OK : importable dans Recto ».
6. **Relire le rapport** : l'aperçu montre la première note de chaque type, carte par carte (question | réponse). Chaque carte doit avoir du sens seule, dans son sens. Traiter les avertissements (ou dire pourquoi on les garde).
7. **Livrer** le `.apkg` et le script de construction (il permet de corriger puis de régénérer), avec le message de livraison ci-dessous.

## Choisir le type de note

| Besoin | Méthode | Ce que Recto en fait |
|---|---|---|
| Paire réversible : mot ↔ traduction, terme ↔ définition courte, symbole ↔ élément | `add_basic` | Une carte, posée dans un sens puis dans l'autre (le paquet alterne après chaque réussite, réglage par défaut) |
| Question à sens unique : pourquoi, comment, question dont la réponse est une explication | `add_question` | Une carte, jamais retournée ; explication et source sous la réponse |
| Phrase, définition, date, formule, courte énumération à compléter | `add_cloze` | Une carte par numéro de trou (`{{c1::…}}`, `{{c2::…}}`) |
| Image légendée : anatomie, carte, schéma, plan, tableau | `add_occlusion` | Une carte par groupe de masques, la zone cachée à retrouver |
| Un objet à plusieurs facettes demandé dans des directions précises : département (carte, nom, numéro, préfecture), mot (son, image, traduction, genre), œuvre (image, titre, auteur, date) | `note_type` + `add_note` | Type de note personnalisé : un champ par facette, **une carte par modèle** : `one_way` pour « A → B » (toujours posée ainsi), `two_way` pour « A ↔ B » (**une seule carte**, posée dans un sens puis dans l'autre) |

Types personnalisés, l'essentiel (détail dans `reference/api.md`) :

- **Champs** : noms uniques, sans `{ } : "`, ne commençant pas par `# ^ /`. Le premier champ identifie la note (doublons, réimportation) : le choisir stable (nom, numéro, image), ou passer `guid=`.
- **Sens des cartes, à respecter à la lettre** : « A → B » est une carte toujours posée dans ce sens : `one_way(nom, question, réponse)`. « A ↔ B » est **une seule carte** qui peut être posée dans un sens ou dans l'autre (la face 1 d'abord, la face 2 après une réussite, comme une note basique) : `two_way(nom, face1, face2)`, jamais deux modèles A → B et B → A. Exemple : « Carte → Nom, Nom ↔ Numéro, Nom ↔ Préfecture » = 3 modèles, donc 3 cartes par note.
- **Modèles** : `one_way(nom, question, réponse)` (la réponse reprend la question par `{{FrontSide}}<hr id=answer>`), `two_way(nom, face1, face2)` (chaque face s'écrit seule, sans `{{FrontSide}}` ; la carte n'existe que si les deux faces ont un contenu). Syntaxe : `{{Champ}}`, `{{#Champ}}…{{/Champ}}` (seulement si le champ est rempli), `{{^Champ}}…{{/Champ}}` (s'il est vide), `{{text:Champ}}`, `{{type:Champ}}` (le champ attendu quand le paquet a la réponse tapée). Une note n'a pas la carte d'un modèle dont la question serait vide pour elle.
- **Mise en forme** : `<br>`, `<b>`, `<i>`, `<u>`, `<sub>`, `<sup>`, `<ul>/<ol>/<li>`, `<p>`, `<hr id=answer>`. Recto retire tout le reste à l'affichage (`<div>` : le texte reste mais sans retour à la ligne ; `style` et CSS : ignorés).
- Au plus 3 champs avec un seul modèle qui demande le 1er champ (ou deux modèles : le 1er puis le 2e) : Recto en ferait une note basique. La bibliothèque le refuse : `add_basic` (une paire A ↔ B seule), ou un champ de plus (`Source`, `Continent`, `Région`).
- Un texte à trous ne vit pas dans un type personnalisé : `add_cloze` (champs Texte et Extra).

## Règles de qualité d'une carte (recherche sur la mémoire)

- **Une information par carte.** Une réponse qui est une liste de plus de 4 éléments, ou un champ de plus de 200 caractères, se découpe ou passe en texte à trous.
- **Rappel actif** : la question force à produire la réponse ; jamais une phrase qu'on se contente de reconnaître, jamais de QCM, de vrai/faux, ni de « Parle-moi de… ».
- **Pas d'ambiguïté** : une seule bonne réponse, sans connaître les cartes voisines ; contexte explicite (« En chimie, … »).
- **La question ne contient pas la réponse**, y compris par une autre facette de la note : dans un type personnalisé, une question ne montre que ce qui est demandé (pas « Ain (01) » sur une carte Nom → Numéro).
- **Réponse courte** ; le pourquoi, l'exemple, la nuance vont dans Extra, Explication, ou sous `<hr id=answer>`.
- **Images = indice, pas béquille** : une image qui aide à retrouver, avec un `alt` qui la décrit sans donner la réponse.
- Les cartes d'une même note sont espacées automatiquement par Recto (pas deux le même jour) : ne pas s'en soucier.
- Dans un `two_way`, chaque face est une question : elle doit se suffire (« Ain » ↔ « 01 » ; pas « Numéro de l'Ain ? » ↔ « 01 », qui donnerait une question « 01 » et une réponse « Numéro de l'Ain ? »).

## Ce qui se règle dans Recto (pas dans le paquet)

- À l'import, l'utilisateur choisit le planificateur des paquets créés : FSRS (défaut) ou Memory Box (boîte à 7 compartiments).
- Les réglages d'un paquet (nouvelles cartes par jour, rétention, alternance des faces, réponse tapée pour les notes basiques, lecture automatique des sons) ne voyagent pas dans un `.apkg` : n'en parler que si le paquet en a besoin, en une ligne précise (« Paquet Vocabulaire › Paramètres : activer la lecture automatique des sons »). La réponse tapée s'active toujours dans les réglages du paquet (« Réponse tapée ») ; `{{type:Champ}}` désigne seulement le champ attendu par une carte `one_way`.
- Sous-paquets : un niveau (`Matière::Chapitre`) ; au-delà, Recto aplatit le nom.
- **Régénérer un paquet corrigé** : même nom de type, mêmes champs, même premier champ (ou même `guid=`) → Recto met à jour les notes au lieu de les dupliquer et garde la progression. Changer les champs ou les modèles d'un type existant n'est pas repris par une réimportation : le dire si c'est le cas.

## Message de livraison

En 5 à 10 lignes :

- le fichier, et ce qu'il contient : paquets, types de notes (cartes par note), nombre de notes, de cartes et de médias ;
- **les points à vérifier** : faits tirés de ta mémoire ou incertains, choix discutables (ex. « Cergy » plutôt que « Cergy-Pontoise »), cartes à suspendre éventuellement ;
- l'import : Recto → Importer → Paquet Anki (.apkg) → choisir le fichier (Google Drive est accessible depuis le sélecteur du téléphone) → planificateur → Importer ;
- les réglages de paquet à faire dans Recto, seulement s'il y en a.

Ne jamais écrire « importé » : tu livres le fichier, l'utilisateur l'importe.
