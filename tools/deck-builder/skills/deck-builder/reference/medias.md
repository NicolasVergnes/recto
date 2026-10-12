# Médias, formules, occlusion

## Images

- **Formats** : PNG (aplats, schémas, cartes), JPEG qualité 80 (photos), WebP, GIF, SVG (dessins vectoriels écrits en texte). Pas de lien vers une image en ligne : Recto ne charge jamais rien depuis Internet, l'image doit être dans le paquet.
- **Taille** : 1 280 px au plus sur le grand côté (au-delà, Recto réduit à l'import), viser moins de 300 Ko par image : le paquet doit rester léger sur un téléphone.
- **Noms** : stables et parlants, sans espace ni accent (`departement_67.png`, `drapeau_italie.svg`).
- **Texte alternatif** : `img(nom, alt)` ; l'`alt` décrit l'image sans donner la réponse (« Carte de France, un département en orange », pas « Bas-Rhin »).
- **Produire une image** (vérifier d'abord ce qui est installé : `python -c "import PIL, matplotlib"`) :
  - **SVG écrit à la main** (aucune dépendance) : schémas, drapeaux, frises, diagrammes ; dimensions dans la balise (`width`, `height`, `viewBox`).
  - **Pillow** : composition, recadrage, conversion, annotations ; **matplotlib** : graphiques, cartes à partir de contours (GeoJSON) ; `savefig(..., dpi=…)` pour tenir dans 1 280 px.
  - **Cartes géographiques** : contours officiels (si le réseau est disponible : par exemple les GeoJSON des départements et régions sur data.gouv.fr ou github.com/gregoiredavid/france-geojson), projetés et dessinés avec matplotlib ; la zone demandée dans une couleur franche, le reste en gris clair ; DOM et petits territoires en encadrés.
  - Photos ou illustrations trouvées en ligne : seulement si leur licence le permet, la citer dans `Extra` ; sinon demander les fichiers à l'utilisateur.
- **Regarder** 2 ou 3 images produites (les ouvrir) avant de construire le paquet : couleur visible, rien de coupé, pas de réponse écrite sur l'image d'une question.

## Sons

- `[sound:nom.mp3]` dans un champ, via `sound(nom)`. Formats : mp3, ogg, opus, webm, m4a. **Pas de WAV** : le convertir (`ffmpeg -i x.wav -q:a 4 x.mp3`).
- Recto lit le son à la demande (touche R) ou automatiquement si le paquet a la lecture automatique (réglage du paquet, à signaler à la livraison).
- Synthèse vocale : seulement si un outil est disponible (`espeak-ng`, `ffmpeg`, ou un service accessible par le réseau), dans la bonne langue ; tu ne peux pas écouter le résultat : le dire à la livraison. Sinon : demander les fichiers, ou faire un modèle `{{#Audio}}…{{/Audio}}` qui ne crée la carte que si le son est présent.
- Jamais de référence à un son qu'on n'a pas produit : le paquet serait refusé (média absent).

## Formules

- LaTeX rendu par KaTeX : `\( … \)` dans le texte, `\[ … \]` en bloc centré. En Python, écrire l'antislash doublé (`"\\(E = mc^2\\)"`) ou une chaîne brute (`r"\(E = mc^2\)"`).
- Dans une formule, `<` s'écrit tel quel (`\(a<b\)`), sans `html.escape`.
- Texte à trous : le trou entoure **toute** la formule (`{{c1::\(E = mc^2\)}}`), jamais une partie.

## Occlusion d'image

Une image légendée dont on cache les étiquettes : une carte par groupe de masques.

1. **Image** : de préférence avec ses étiquettes écrites dessus (c'est ce qu'on cache). Si tu la génères, garde la boîte de chaque étiquette au moment de la dessiner :
   - Pillow : `draw.textbbox((x, y), texte, font=police)` → `(gauche, haut, droite, bas)` ;
   - matplotlib : `t.get_window_extent(renderer=fig.canvas.get_renderer())`, en pixels depuis le bas (inverser l'axe vertical) ;
   - SVG : largeur estimée ≈ 0,6 × taille de police × nombre de caractères, hauteur ≈ 1,3 × taille ; la ligne de base est `y`.
2. **Masques** : `Mask.from_pixels(groupe, gauche, haut, largeur, hauteur, image=(L, H), answer="Étiquette", padding=6)`. Marge de 4 à 8 px : le masque doit couvrir tout le texte.
3. **Image fournie par l'utilisateur** : `image_size()` donne ses dimensions ; repérer les étiquettes en regardant l'image, placer les masques, puis **les dessiner sur une copie** (Pillow, rectangles pleins) et regarder la copie pour vérifier que chaque étiquette est entièrement couverte.
4. **Groupes** : un groupe = une carte ; deux masques du même groupe sont révélés ensemble (une structure étiquetée deux fois). Une réponse (`answer`) pour chaque groupe.
5. `hide_all=True` (défaut) : toutes les étiquettes restent cachées, celle demandée est mise en évidence (plus difficile, recommandé) ; `False` : seule l'étiquette demandée est cachée.
6. `header` : titre affiché des deux côtés (« Les os du membre supérieur ») ; `extra` : précision après la réponse.
