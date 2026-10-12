---
name: deck-builder
description: Crée un paquet de flashcards en CSV importable dans l'application Recto (répétition espacée). À utiliser quand l'utilisateur demande des cartes, des flashcards, un paquet, des fiches de révision ou du texte à trous à partir d'un sujet, d'un cours, d'un PDF ou de notes, ou veut importer des cartes dans Recto.
---

# Création de paquets pour Recto

Tu produis un fichier **CSV** que l'utilisateur importe dans Recto (Importer → CSV). Recto est une application de flashcards à répétition espacée, en français, locale, sans serveur. Ce que tu écris est relu par l'utilisateur avant import : vise des cartes prêtes à apprendre, pas un résumé du cours.

## Démarche

1. **Cadrer** (une seule question groupée, sauf si c'est déjà clair) : sujet et source, niveau, nombre de cartes souhaité, nom du paquet. À défaut de réponse : 20 à 40 cartes, nom déduit du sujet.
2. **Extraire** les faits à retenir de la source fournie. Ne rien inventer : si la source ne dit pas, ne pas compléter de mémoire sans le signaler ; si tu ajoutes un fait extérieur, le dire dans la réponse.
3. **Rédiger** les cartes selon les règles ci-dessous.
4. **Vérifier** : écrire le fichier, lancer `python scripts/check_deck.py fichier.csv`, corriger jusqu'à « OK ».
5. **Livrer** le fichier et, en 3 à 5 lignes, dire : nombre de cartes, paquet(s), points à relire (faits incertains, cartes limites).

## Règles de qualité d'une carte (issues de la recherche sur la mémoire)

- **Une information par carte** (carte atomique). Une question dont la réponse est une liste de plus de 4 éléments, ou un recto/verso de plus de 200 caractères, se découpe en plusieurs cartes ou passe en texte à trous.
- **Rappel actif** : le recto est une vraie question ou un indice qui force à produire la réponse, jamais une phrase qu'on reconnaît. Pas de « Parle-moi de… ».
- **Pas d'ambiguïté** : une seule bonne réponse possible, sans connaître la carte voisine. Rendre le contexte explicite (« En physique, … »).
- **Verso court** : la réponse seule. Le « pourquoi », l'exemple, la nuance vont dans **Extra**, affiché après la réponse.
- **Pas de carte en double** dans l'autre sens : une note basique est posée dans les deux sens par Recto selon le réglage du paquet. N'écris pas aussi la carte inverse.
- **Texte à trous** pour les définitions, dates, formules à compléter, énumérations courtes. Un trou = une idée ; 1 à 3 trous par phrase.
- Phrases dans la langue de la source. Vocabulaire de langue : recto = mot, verso = traduction, extra = exemple.

## Format du fichier (strict)

- **UTF-8**, séparateur **point-virgule `;`**, une ligne par note. Entourer toute cellule de guillemets `"…"` et doubler un guillemet interne (`""`). Les retours à la ligne dans une cellule sont permis entre guillemets mais préférer `<br>`.
- **Première ligne = en-tête obligatoire.** Une colonne doit s'appeler `recto` (ou `texte` pour le cloze).
- Colonnes reconnues (par leur nom, dans n'importe quel ordre) : `recto`, `verso`, `extra`, `tags`, `deck`, `type`. Sans noms, l'ordre serait recto, verso, extra : toujours mettre l'en-tête.
- `tags` : mots séparés par des espaces, sans accents ni espaces dans un tag (`histoire dates`).
- `deck` : nom du paquet ; `::` pour un sous-paquet (`Histoire::Renaissance`). Le paquet est créé s'il n'existe pas. Un même fichier peut viser plusieurs paquets.
- **Basique** : colonnes `recto;verso;extra;tags;deck`. Exemple : `examples/basique.csv`.
- **Texte à trous (cloze)** : colonnes `texte;extra;tags;deck`. Syntaxe `{{c1::réponse}}` ou avec indice `{{c1::réponse::indice}}`. Numéros distincts = une carte par numéro ; même numéro = masqués ensemble. Exemple : `examples/cloze.csv`.
- **Basique et cloze dans un même fichier** : il faut une colonne `type` avec `basic` ou `cloze` à chaque ligne (`type;recto;verso;extra;tags;deck`). Sans colonne `type`, un fichier est entièrement basique ou entièrement cloze (dès qu'une ligne contient `{{c1::`, les lignes basiques échouent). Exemple : `examples/mixte.csv`. Par défaut, préférer deux fichiers.
- Aucune ligne dont le recto est vide. Pas de doublon de recto dans un même paquet (le doublon est ignoré à l'import).

### HTML et formules dans les champs

- Balises autorisées : `<b> <i> <u> <br> <hr> <p> <ul> <ol> <li> <sub> <sup> <span>`. Toute autre balise est retirée ; pas de style, pas de lien.
- **Formules LaTeX** : `\( … \)` en ligne, `\[ … \]` en bloc (rendu KaTeX). Dans un CSV, l'antislash s'écrit tel quel. Pour un cloze, mettre le trou **autour de toute la formule**, jamais dedans.
- **Pas de médias** : ni `<img>`, ni `[sound:…]` (les fichiers ne voyagent pas avec un CSV). Décrire en mots, ou signaler à l'utilisateur qu'il faudra ajouter l'image dans Recto.

## À ne pas faire

- Pas de QCM, de vrai/faux, de « note de difficulté » ni de numérotation dans le recto.
- Pas de recto qui contient la réponse.
- Pas de paquet géant sans demande : au-delà de 60 cartes, proposer de livrer en plusieurs fichiers par thème.
- Ne jamais annoncer « importé » : tu livres le fichier, l'utilisateur l'importe dans Recto.

## Import côté utilisateur

Recto → Importer → CSV → choisir le fichier (Google Drive accessible depuis le sélecteur sur téléphone) → vérifier l'aperçu et le rapport → valider. Une relecture rapide dans l'aperçu avant de valider évite d'apprendre une erreur.
