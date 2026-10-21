# Charte de rédaction des cartes

Ce que la recherche sur la mémoire et le livret de la Memory Box (Olicard & Holynski, 2018) imposent au **format** d'une carte, et comment la bibliothèque l'applique. Les règles sont numérotées R1 à R13 ; la vérification de `Package.write()` et de `recto_rpkg.py check` signale les manquements détectables par « charte Rn — … ». Les sources sont en fin de fichier ; le détail est dans le dossier de recherche de Recto (`Dossier-Flashcards.html`, §1.4 et §2.3).

## Pourquoi un format compte

Une flashcard n'apprend rien par elle-même : son efficacité vient de deux mécanismes, **se tester** (effet de test, g ≈ 0,5 sur 200 études, Rowland 2014) et **espacer** (g ≈ 0,7, Latimier 2021). L'espacement est l'affaire de Recto (FSRS, Memory Box). Le format de la carte, lui, décide si le test a lieu : le **rappel indicé** (une question courte, une réponse à produire) est le format le plus efficace ; la **reconnaissance** (QCM, vrai/faux, relecture) n'apporte presque rien ; et l'effet **s'effondre quand la réussite initiale passe sous 50 %** (Rowland 2014). Une bonne carte force donc un rappel, reste réussissable, et porte peu.

## Les règles

### R1 · Une information par carte

Principe d'information minimale (Wozniak, règle 4 ; Olicard, règle 1 : « plus une fiche contient d'informations différentes, moins vous les retiendrez »). Les petites unités se rappellent mieux et se planifient mieux : une carte ratée sur un détail ne renvoie pas tout un paragraphe en apprentissage.

- Une réponse = un mot, un nombre, une expression, une phrase courte. **Plus de 25 mots** ou plus de 200 caractères : découper, ou passer en texte à trous.
- Le pourquoi, l'exemple, la nuance vont dans `Extra` / `Explication` : affichés après la réponse, jamais demandés.
- Un fait qui en cache plusieurs (« François I<sup>er</sup> : règne 1515-1547, Marignan 1515, Chambord ») = plusieurs cartes.

### R2 · Comprendre avant de mémoriser

Wozniak, règles 1 et 2 ; Olicard, règle 2. Le rappel transfère vers du contenu non testé (d = 0,40, Pan & Rickard 2018) seulement si le contenu est compris et si la réussite initiale est bonne. Des faits isolés font des « faits déconnectés » (dossier §1.6).

- Partir d'une source lue et comprise ; chaque carte doit être répondable à partir d'elle.
- Dans un paquet de cours ou de concepts, **1 carte de raisonnement pour 5 à 10 cartes de faits** : `add_question` « Pourquoi… ? », « Comment… ? », « Donne un exemple de… », « Quelle différence entre A et B ? », à réponse courte, avec l'explication dans `explanation`.
- Un paquet de vocabulaire, de drapeaux ou de dates n'en a pas besoin.

### R3 · Formulation télégraphique

Olicard, règle 3 (« Quel est le périmètre de la Terre ? » devient « Terre : périmètre ») ; Wozniak, règle 12 (« optimize wording »). Une question courte se lit en une seconde et laisse tout le temps au rappel.

- Paires et faits : style **« Sujet : attribut »** → valeur. « Australie : capitale » → « Canberra » ; « Marignan : bataille » ↔ « 1515 » ; « Lune : 1<sup>er</sup> pas » → « 21/07/1969 ».
- Questions de raisonnement (`add_question`) : une phrase interrogative entière, mais une seule.
- Le libellé du type de note ou du paquet ne fait pas partie de la question : « Départements » dans le nom du paquet ne dispense pas de « … : préfecture » sur la carte si la face peut être ambiguë.

### R4 · Rappel, pas reconnaissance

Rowland 2014 : rappel indicé > rappel libre > reconnaissance. Le skill `srs-rules` de Recto refuse tout « mode apprendre » qui n'est que de la reconnaissance ; le paquet ne doit pas en réintroduire par la porte des cartes.

- **Jamais** : QCM (« a) … b) … »), vrai/faux, « est-ce que… ? », réponse oui/non (une chance sur deux, aucun rappel), « parle-moi de », « décris », « résume », « que sais-tu de ».
- Une question oui/non se retourne en demande de valeur : « La photosynthèse absorbe-t-elle du CO₂ ? » → « Photosynthèse : gaz absorbé » → « CO₂ ».
- Une question ouverte se découpe en faits (R1) et, si le raisonnement compte, devient un `add_question` à réponse courte.

### R5 · Une seule bonne réponse, sans la montrer

Wozniak, règles 11 (combattre les interférences) et 16 (indices de contexte) ; Olicard, règle 8 (préciser lieu, date : « Nombre pays Union Européenne / 2018 : 28 »).

- Une carte se répond **sans connaître les cartes voisines** : contexte explicite dans la question (« En chimie, … », « (2018) », « en LSF »).
- **La question ne contient pas la réponse**, ni par une autre facette de la note : sur une carte Nom → Numéro, la question montre « Ain », pas « Ain (01) » ; sur une carte Carte → Nom, la carte muette, sans le nom écrit dessus.
- Deux questions qui se ressemblent et deux réponses qui se ressemblent (Ravenne / Rimini, 1515 / 1551) = interférence : ajouter à chacune l'indice qui les distingue, ou une carte de contraste (`add_question` « Quelle différence entre … ? »).
- Dans un type personnalisé, **la question d'une carte doit dépendre de la note** (sinon Recto ne crée pas la carte) et différer d'une note à l'autre ; la bibliothèque signale deux notes qui rendent la même question, et deux cartes d'une même note qui posent la même face (voir R9 : la face dit ce qu'on cherche).

### R6 · Pas de listes

Olicard, règle 7 (« bannir les listes », découper « UE / pays de A à C », « UE / pays de D à G »…) ; Wozniak, règles 9 et 10 (ensembles et énumérations) ; Recto avertit lui-même au-delà de 4 éléments (principe P8).

- **Ordre sans importance** (un ensemble) : une carte par élément avec la relation inverse (« Autriche : union → UE (1995) »), ou des groupes de **4 au plus** triés par un critère écrit dans la question (« UE : pays de A à C »), plus une carte du total (« UE : nombre de pays (2018) » → 28).
- **Ordre important** (une séquence : planètes, couches, étapes, rois) : trous chevauchants, `add_sequence(deck, titre, éléments)` : une carte par élément qui ne montre que ses voisins et son rang (« Planètes, du Soleil vers l'extérieur — 3/8 : …, Vénus, [Terre], Mars, … »). Au besoin, une carte mnémotechnique (R11) pour l'ordre entier.
- Une réponse qui est une liste de plus de 4 éléments, un trou qui cache une liste, une question « cite les… » sont signalés.

### R7 · Texte à trous : un trou court dans un contexte qui questionne

Olicard, règle 4 ; Wozniak, règle 5 (« cloze deletion is easy and effective »). Le trou garde la difficulté du rappel tout en maintenant la réussite au-dessus de 50 %.

- **Un trou = un mot, un nombre, une expression courte** (plus de 6 mots : découper en plusieurs trous `{{c1::…}}`, `{{c2::…}}`).
- Le texte visible doit **poser une question** : « La {{c1::mitochondrie}} est le siège de la respiration cellulaire », pas « {{c1::La mitochondrie est le siège de la respiration cellulaire}} » ; pas de trou sans contexte (« {{c1::1515}} »).
- La réponse d'un trou ne se lit pas ailleurs dans le texte ; deux trous de même numéro sont cachés ensemble (voulu pour une expression répétée).
- Une formule se cache **entière** (`{{c1::\(E = mc^2\)}}`, voir `medias.md`).
- Indice dans le trou (`{{c1::réponse::indice}}`) quand la réussite serait sous 50 % sans lui : catégorie (« ::unité »), ou pendu (R10).

### R8 · L'image est un indice, pas une béquille

Carpenter & Olson 2012 : une image ajoutée à un mot **gonfle la confiance sans améliorer le rappel**, sauf si l'apprenant est averti. Olicard, règle 5 (favoriser le visuel) ; Wozniak, règles 6 et 8 (imagerie, occlusion).

- L'image est **ce qu'on reconnaît pour produire la réponse** : drapeau → pays, carte muette → département, photo → plante, astérisme sans nom → constellation, signe → mot. Dans la question, donc, et elle **porte le rappel** : la réponse ne doit pas être écrite dessus (légende, titre, nom de fichier visible).
- Une image **dans la réponse** seulement si c'est l'objet à produire mentalement (mot → signe LSF, nom → forme d'une feuille) : on se représente le signe, puis on compare. Pas d'image décorative à côté d'un mot de vocabulaire.
- Image légendée (anatomie, carte, schéma) : `add_occlusion`, un masque par étiquette, `hide_all=True`.
- `alt` : décrit l'image **sans la nommer** (« Carte de France, un département en orange », pas « Bas-Rhin ») ; la bibliothèque signale un `alt` qui contient un mot de la réponse.

### R9 · Deux sens quand la relation est symétrique, un sens sinon

Olicard : fiche réversible, « la question peut devenir une réponse », retournée après chaque passage ; Wozniak, règle 17 (la redondance bidirectionnelle est bienvenue, sur des cartes séparées) ; dossier §2.3. Dans Recto, une note basique et un modèle `two_way` sont **une carte posée dans un sens puis dans l'autre** ; chaque face est donc tour à tour la question.

- `add_basic` / `two_way` seulement si **chaque face se suffit comme question et n'a qu'une réponse** : mot ↔ traduction, nom ↔ numéro, événement ↔ date (si la date est unique dans le paquet), terme ↔ symbole.
- Chaque face s'écrit comme une **étiquette qui dit ce qu'on cherche de l'autre côté**, pas comme une phrase interrogative : « Terre : périmètre ? » ↔ « 40 075 km » ; jamais « Quel est le périmètre de la Terre ? » ↔ « 40 075 km » (la phrase deviendrait la réponse). La bibliothèque signale une face en phrase interrogative dans une carte à deux sens.
- **Recto n'affiche ni le nom du modèle ni celui du champ** pendant la révision (seulement « ↔ Sens inversé ») : quand une note porte plusieurs cartes à deux sens, la face seule (« Bas-Rhin ») ne dit pas s'il faut trouver le numéro ou la préfecture, et « 67 » ne dit pas qu'on cherche un département. Convention : **valeur en gras, puis l'attribut demandé en italique** — `<b>{{Nom}}</b><br><i>numéro ?</i>` ↔ `<b>{{Numéro}}</b><br><i>département ?</i>` et `<b>{{Nom}}</b><br><i>préfecture ?</i>` ↔ `<b>{{Préfecture}}</b><br><i>département ?</i>`. Vue comme réponse, la ligne en italique rappelle simplement la question inverse. Deux cartes d'une note qui posent la même face sont signalées (R5).
- Relation **non symétrique** (département → région, plante → famille, pourquoi → explication, image → nom quand on ne veut pas nom → image) : `add_question` ou `one_way`. Deux notes qui partagent une face 2 (« Grand Est ») rendraient la carte inverse ambiguë : signalé.
- Deux sens sur deux cartes séparées (A → B et B → A en `one_way`) seulement si les deux sens demandent des formulations différentes ; sinon un seul `two_way`.

### R10 · Réussissable : indice récupérateur plutôt que carte impossible

Rowland 2014 (effet nul sous 50 % de réussite) ; Pyc & Rawson 2009 (un rappel difficile mais réussi renforce plus qu'un rappel facile) ; Olicard, règle 4 et p. 38 (traits « comme dans un pendu », un chiffre révélé).

- La difficulté vient du **délai** (c'est Recto qui l'augmente), pas d'une question opaque.
- Quand la réponse est une date, un nombre, un nom propre rare : un indice qui **ne donne pas la réponse** : `pendu("1515")` → « 1 _ _ _ », `pendu("Strasbourg", 2)` → « St _ _ _ _ _ _ _ _ », une catégorie (« (ville) »), une première lettre. Dans la question d'un `add_question` / `one_way`, ou comme indice d'un trou : `{{c1::1515::1 _ _ _}}`. Pas dans une face `two_way` (elle deviendrait une réponse).
- Ne pas sur-indicer : l'indice réduit l'espace des réponses, il ne la désigne pas.

### R11 · Mnémotechnie et balises, dans Extra

Olicard, règle 9 et chapitre « Balisez vos infos » (« LUNE » / « 16/07/1969 », couleurs, VIBUJOR, rébus) ; Wozniak, règle 7 ; Dunlosky 2013 (mnémonique par mot-clé « faible utilité » en général, utile pour les listes ordonnées).

- L'astuce va dans `Extra` / `Explication` (« Astuce : VIBUJOR », « Moyen mnémotechnique : Me Voici Tout Mouillé… »), jamais dans la question (elle donnerait la réponse) ni à la place de la réponse.
- Un moyen mnémotechnique est un complément pour une séquence ou une liste difficile (R6), pas le moteur du paquet.
- Les balises visuelles du livret (couleur, taille) ne voyagent pas dans un paquet (Recto ignore le CSS) : utiliser `<b>`, `<i>`, et une image quand elle sert d'indice (R8).

### R12 · Prioriser, et ne pas fragmenter en mini-paquets

Olicard, règle 10 (« être exigeant, mais pas trop ») ; Wozniak, règle 20 ; Kornell 2009 (un grand paquet revu chaque jour bat quatre petits paquets travaillés en bloc, pour 90 % des participants) ; Kornell & Bjork 2008 (ne pas abandonner une carte après un succès).

- Par défaut **20 à 40 notes** par paquet demandé, les plus importantes d'abord ; au-delà, dire ce qui a été laissé de côté.
- Les cartes secondaires : tag `bonus` et `suspended=True` (l'utilisateur les réactive quand le reste est acquis), plutôt qu'un paquet gonflé.
- Un paquet ou des sous-paquets d'au moins ~20 cartes ; pas de sous-paquet par page de cours. Recto mélange de toute façon tout ce qui est dû dans une seule file.
- Ne jamais écrire dans le paquet une consigne « supprimer après » : Recto ne retire une carte qu'après 3 succès espacés (P7).

### R13 · Précision, date et source

Olicard, règle 8 ; Wozniak, règles 18 (sources) et 19 (dater). Un fait qui peut changer (nombre de pays, record, prix, loi) porte sa date **dans la question** (« UE : nombre de pays (2018) ») ; un fait incertain porte sa source (`source=` de `add_question`, champ `Source` d'un type personnalisé, ou `Extra`) ; un fait tiré de mémoire est signalé à la livraison.

## Formats par sujet

| Sujet | Type et cartes | Exemple recto → verso | Pièges |
|---|---|---|---|
| **Vocabulaire** | `add_basic` mot ↔ traduction ; `Extra` : genre, exemple, prononciation ou son ; une acception par carte ; `add_cloze` phrase d'usage avec le mot en trou (indice `::traduction`) | « la pomme » ↔ « the apple » ; « I {{c1::borrowed::emprunter}} a book » | « bank » → « banque / rive » : deux cartes « bank (argent) », « bank (rivière) » ; image décorative (R8) |
| **Dates, événements, personnages** | `add_basic` étiquette ↔ date si la date est unique dans le paquet, sinon `add_question` avec `pendu` ; cartes « qui ? », « où ? », « conséquence ? » séparées | « Marignan : bataille » ↔ « 1515 » ; « Marignan : vainqueur » → « François I<sup>er</sup> » ; « 1<sup>re</sup> femme Nobel » → « Marie Curie » | une carte « Marignan » dont le verso raconte tout (R1) ; deux événements de 1515 en `two_way` (R9) |
| **Drapeaux, départements, pays** | type personnalisé : `one_way` image → nom ; `two_way` nom ↔ numéro / capitale (uniques), chaque face disant ce qu'on cherche ; `one_way` nom → région, continent (non uniques) | voir `api.md` (Département) ; « Bas-Rhin / numéro ? » ↔ « 67 / département ? » ; « Drapeau → Pays » | nom écrit sur la carte ; `two_way` nom ↔ région (R9) ; « Ain (01) » sur la carte Nom → Numéro (R5) ; face « Bas-Rhin » nue partagée par deux cartes (R5) |
| **Constellations** | `one_way` astérisme muet → nom ; `one_way` nom → étoile principale ; saison, hémisphère dans `Extra` ; `add_occlusion` sur une carte du ciel | « [schéma] Quelle constellation ? » → « Orion » ; « Orion : étoile la plus brillante » → « Rigel » | schéma avec le nom ; « Décris Orion » (R4) |
| **LSF** | pas de vidéo dans Recto : image ou dessin du signe (une ou deux positions) ; `two_way` mot ↔ image **si** on veut les deux compétences (comprendre un signe, produire un signe) ; sinon `one_way` image → mot | « [signe] » ↔ « MERCI » | alt qui nomme le signe (R8) ; signes proches sans indice distinctif (R5) |
| **Plantes** | type personnalisé : Photo1, Photo2, Nom, Famille, Indice ; `one_way` Photo1 → Nom, Photo2 → Nom ; `one_way` Nom → Famille ; `add_question` « Comment distinguer A de B ? » | « [feuille] Quelle plante ? » → « Ortie dioïque » ; « Ortie : famille » → « Urticacées » | une seule photo (angle unique) ; photo avec étiquette ; nom → photo seul (reconnaissance) |
| **Maths, sciences** | `add_cloze` définition avec le terme **ou** un mot clé en trou ; formule entière en trou ; `one_way` nom → formule ; `add_question` « Pourquoi… ? », exemples numériques courts | « Dérivée de x² » → « 2x » ; « {{c1::\(\frac{d}{dx}x^n = nx^{n-1}\)}} » | démonstration entière sur une carte (R1) ; trou sur la moitié d'une formule (R7) |
| **Cours, concepts** | `add_cloze` sur la définition ; `add_basic` terme ↔ définition **courte** seulement si elle est unique et brève ; `add_question` pourquoi / comment / exemple / différence (R2) | « L'effet de test : se {{c1::rappeler}} apprend plus que {{c2::relire}} » ; « Pourquoi espacer les révisions ? » → « L'oubli entre deux rappels rend le rappel plus difficile, donc plus formateur » | « Parle-moi de l'effet de test » ; définition entière en trou ; liste des « 5 causes » (R6) |

## Avant / après

| Carte reçue ou tentée | Règle | Carte livrée |
|---|---|---|
| « Quelles sont les 8 planètes du système solaire ? » → « Mercure, Vénus, … » | R6 | `add_sequence("Astronomie", "Planètes, du Soleil vers l'extérieur", [...])` + `Extra` mnémotechnique (R11) |
| « La photosynthèse absorbe-t-elle du CO₂ ? » → « Oui » | R4 | « Photosynthèse : gaz absorbé » → « CO₂ » (et « Photosynthèse : gaz rejeté » → « O₂ ») |
| « Capitale de l'Australie : a) Sydney b) Canberra » | R4 | `add_basic` « Australie : capitale » ↔ « Canberra » |
| `add_basic("Quel est le périmètre de la Terre ?", "40 075 km")` | R9, R3 | `add_basic("Terre : périmètre ?", "40 075 km")` |
| `two_way("Nom ↔ Numéro", "{{Nom}}", "{{Numéro}}")` et `two_way("Nom ↔ Préfecture", "{{Nom}}", "{{Préfecture}}")` sur la même note | R5, R9 | faces `<b>{{Nom}}</b><br><i>numéro ?</i>` ↔ `<b>{{Numéro}}</b><br><i>département ?</i>`, et `<b>{{Nom}}</b><br><i>préfecture ?</i>` ↔ `<b>{{Préfecture}}</b><br><i>département ?</i>` |
| `add_basic("Bas-Rhin", "Grand Est")` (10 départements → « Grand Est ») | R9 | `one_way("Nom → Région", …)` ou `add_question("Bas-Rhin : région", "Grand Est")` |
| « {{c1::La mitochondrie est le siège de la respiration cellulaire}} » | R7 | « La {{c1::mitochondrie}} est le siège de la {{c2::respiration cellulaire}} » |
| Carte Nom → Numéro dont la question affiche « Ain (01) » | R5 | la question n'affiche que « Ain » |
| « Parle-moi de la Révolution française » | R4, R1 | « Révolution française : début » → « 1789 » ; « Bastille : prise » → « 14/07/1789 » ; `add_question("Pourquoi la monarchie absolue tombe-t-elle en 1789 ?", …)` |
| « Date de Marignan ? » → « 13-14 septembre 1515, victoire de François I<sup>er</sup> sur les Suisses, qui ouvre le Milanais… » | R1 | « Marignan : bataille » ↔ « 1515 », `extra="13-14 septembre ; François Ier bat les Suisses"` |
| « Nombre de pays de l'UE » → « 27 » | R13 | « UE : nombre de pays (2024) » → « 27 » |
| « Traduis : bank » → « banque / rive » | R5 | « bank (argent) » ↔ « banque » ; « bank (rivière) » ↔ « rive » |
| Photo de plante avec son nom en légende | R8 | photo recadrée sans légende, ou `add_occlusion` sur la légende |
| « Année du premier Oscar de DiCaprio » (réussite improbable) | R10 | `add_question("DiCaprio : 1er Oscar (" + pendu("2016") + ")", "2016")` → « 2 _ _ _ » |

## Grille de relecture avant livraison

À faire sur l'aperçu du rapport (première note de chaque type, carte par carte) et sur les avertissements « charte » :

1. Chaque carte a **un seul rappel** à faire et une réponse courte (R1).
2. Chaque question est **une demande de valeur**, ni oui/non, ni QCM, ni « décris » (R4).
3. Chaque carte se répond **seule**, sans les cartes voisines, et la question ne montre pas la réponse (R5).
4. Aucune liste de plus de 4 éléments ; les séquences sont en `add_sequence` (R6).
5. Chaque trou est court et le texte visible pose une question (R7).
6. Chaque image est dans la question, muette, avec un `alt` qui ne nomme pas la réponse (R8).
7. Chaque `two_way` / `add_basic` a deux faces-étiquettes, chacune à réponse unique ; le reste est à sens unique (R9).
8. Les réponses difficiles (dates, nombres, noms rares) ont un indice qui ne les donne pas (R10).
9. Dans un paquet de concepts, il y a des cartes « pourquoi / comment » (R2).
10. Les faits volatils sont datés, les faits incertains sourcés ou signalés (R13).

Un avertissement « charte » gardé volontairement (par exemple une face « … ? » dans un paquet que l'utilisateur veut à sens unique via le réglage du paquet) se **justifie dans le message de livraison** ; il ne s'ignore pas en silence.

## Sources

- Wozniak, P. (1999). *Effective learning: Twenty rules of formulating knowledge.* SuperMemo. — règles 1-20 citées ci-dessus.
- Olicard, F. & Holynski, C. (2018). *La Memory Box*, Larousse — livret : « Comment créer ses propres flashcards ? » (dix règles d'or, p. 18-23), « Balisez vos infos », « Les couleurs », « Les indices », « Les dessins », « La mnémotechnie », « Les rébus » (p. 36-40), « Qu'est-ce qu'une flashcard ? » (p. 8-11), compartiments et retournement (p. 12-16).
- Rowland, C. A. (2014). The effect of testing versus restudy on retention: a meta-analytic review of the testing effect. *Psychological Bulletin*, 140(6). — g = 0,50 ; feedback 0,73 vs 0,39 ; rappel indicé ; effet nul sous 50 % de réussite initiale.
- Carpenter, S. K. & Olson, K. M. (2012). Are pictures good for learning new vocabulary in a foreign language? Only if you think they are not. *JEP: Learning, Memory, and Cognition*, 38(1).
- Kornell, N. & Bjork, R. A. (2008). Optimising self-regulated study: the benefits—and costs—of dropping flashcards. *Memory*, 16(2).
- Kornell, N. (2009). Optimising learning using flashcards: spacing is more effective than cramming. *Applied Cognitive Psychology*, 23(9).
- Karpicke, J. D. & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science*, 319.
- Pan, S. C. & Rickard, T. C. (2018). Transfer of test-enhanced learning: meta-analytic review and synthesis. *Psychological Bulletin*, 144(7). — d = 0,40.
- Pyc, M. A. & Rawson, K. A. (2009). Testing the retrieval effort hypothesis. *Journal of Memory and Language*, 60(4).
- Dunlosky, J. et al. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*, 14(1).
- Latimier, A., Peyre, H. & Ramus, F. (2021). A meta-analytic review of the benefit of spacing out retrieval practice episodes on retention. *Educational Psychology Review*, 33. — g = 0,74 ; intervalles croissants vs fixes g = 0,03.
- Cepeda, N. J. et al. (2008). Spacing effects in learning: a temporal ridgeline of optimal retention. *Psychological Science*, 19(11).
- Rohrer, D., Dedrick, R. F. & Stershic, S. (2015). Interleaved practice improves mathematics learning. *Journal of Educational Psychology*, 107(3). — d = 0,79.
- Recto, `docs/01-SPEC.md` §4 (principes P1-P11) et `.claude/skills/srs-rules/SKILL.md` ; `Dossier-Flashcards.html` §1.4, §1.6, §2.1-2.3.
