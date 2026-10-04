# Waysake — système de design « Horizon », marque Encre

Ce document décrit les fondations visuelles de Waysake (phase 1 de la refonte) : principes, jetons, couleurs de
voyage, logo et composants. Il sert de référence pour refaire chaque écran (phase 2, liste en fin de document).
Ce qui n'y est pas décrit n'existe pas encore : on l'ajoute ici avant de l'utiliser.

## 1. Principes

1. **L'interface est en noir et blanc, la couleur vient des voyages.** La marque, *Encre*, est un quasi-noir
   (`#1B1B1E`) en clair et un blanc cassé (`#EDEDEA`) en sombre. Elle sert au logo, au bouton principal, à l'onglet
   actif et au focus. Elle n'est jamais une couleur de voyage.
2. **Chaque voyage a une couleur**, tirée de sa photo de couverture puis arrondie à une palette fermée de dix
   teintes (comme les pochettes dans Musique). Elle teinte la page du voyage, son itinéraire, ses étapes, son
   étiquette dans la liste et son tracé sur le globe.
3. **Les photos sont le sujet.** Fonds gris neutres (ni bleus ni crème), pas d'ornement, pas de dégradé décoratif.
   Une couverture se fond dans la page par un **flou progressif** (voir §6), pas par un voile noir.
4. **La couleur n'est jamais seule.** Une pastille accompagne toujours un nom de voyage, ou le nom de la couleur
   est écrit (étiquette, légende du globe). Avec dix teintes, deux couleurs restent proches pour un daltonien.
5. **Une seule action Encre par écran.** Les autres actions sont discrètes (`.button--quiet`, liens).
6. **Clair et sombre** suivent le système ; `<html data-theme="light|dark">` force l'un ou l'autre.
7. **Hors ligne.** Polices et images de marque sont servies par la tour : aucune requête vers Google Fonts ou un CDN.

## 2. Jetons (`web/styles/tokens.css`)

Ne jamais écrire une couleur, une taille de police ou une ombre en dur dans un écran : utiliser un jeton.
Exceptions tolérées : le blanc et le noir **sur une photo** ou dans le diaporama et la visionneuse (fonds
toujours sombres), et les valeurs passées à MapLibre (lire le jeton avec `getComputedStyle`).

### Couleurs

| Jeton | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `--bg` | `#F6F6F4` | `#0C0C0E` | fond de page |
| `--surface` | `#FFFFFF` | `#17171A` | cartes, feuilles, menus |
| `--surface-raised` | `#FFFFFF` | `#1F1F23` | surface posée sur une surface |
| `--surface-sunken` | `#EFEFEC` | `#111113` | champs, segments, puits |
| `--glass` | blanc 72 % | `#1E1E22` 62 % | barres translucides (+ `backdrop-filter`) |
| `--overlay` | noir 42 % | noir 55 % | derrière une feuille, un dialogue |
| `--scrim` | noir 32 % | noir 42 % | bouton rond sur photo (icône blanche) |
| `--text` | `#141416` | `#EDEDEB` | texte |
| `--text-muted` | `#606369` | `#9C9EA3` | métadonnées, aides (AA) |
| `--text-faint` | `#8B8E93` | `#6E7075` | indications non essentielles (sous AA) |
| `--text-on-photo` | `#FFFFFF` | `#FFFFFF` | texte posé sur une image |
| `--line` / `--line-strong` | encre 9 % / 15 % | blanc 9 % / 16 % | séparateurs, contours |
| `--accent` | `#1B1B1E` | `#EDEDEA` | **Encre** : bouton principal, onglet actif |
| `--accent-hover` | `#2C2C31` | `#FFFFFF` | survol du bouton principal |
| `--on-accent` | `#FFFFFF` | `#141416` | texte et icône sur `--accent` |
| `--brand-pin` | `#E87162` | `#E87162` | l'épingle du logo, rien d'autre |
| `--focus` | `#141416` | `#EDEDEB` | anneau de focus (2 px, décalé de 2 px) |
| `--danger` / `--success` / `--warning` | `#B4321F` / `#1F7A4A` / `#9A6400` | `#FF8A78` / `#6FD39B` / `#F2B85B` | messages d'état uniquement |
| `--globe-*` | gris clairs | gris sombres | océan, terres, pays visités, frontières, ciel du globe |

### Typographie : Geist

Geist et Geist Mono sont empaquetées (`@fontsource-variable/geist`, `…/geist-mono`, importées dans
`web/main.tsx`). `--font-sans` pour tout ; `--font-display` (même famille) pour les titres, avec un approche
serré ; `--font-mono` pour les chiffres techniques (tailles, identifiants).

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--fs-2xs` | 11 px | légendes du globe, onglets |
| `--fs-xs` | 12 px | étiquettes, badges |
| `--fs-sm` | 13,5 px | métadonnées (dates · étapes · photos) |
| `--fs-md` | 15 px | lignes de liste, boutons |
| `--fs-base` | 16 px | corps |
| `--fs-lg` | 19 px | intertitres |
| `--fs-xl` | 24 px | titre de carte, de feuille |
| `--fs-2xl` | 30 px | titre d'écran (« Voyages ») |
| `--fs-3xl` | 34 → 46 px | grand titre |
| `--fs-display` | 40 → 72 px | titre sur une couverture |

Graisses `--fw-regular` 400, `--fw-medium` 500, `--fw-semibold` 600, `--fw-bold` 650 (titres d'écran et de
couverture). Approche `--tracking-tight` (-0,02 em, titres courants) et `--tracking-tighter` (-0,045 em, grands
titres). Interlignes `--lh-tight` 0,98, `--lh-snug` 1,2, `--lh-body` 1,5. Chiffres tabulaires partout (`body`).

Classes prêtes (`web/styles/base.css`) : `.title` + `.title--sm | --md | --lg | --display` (remplacent l'ancien
panneau `Sign`), `.step-number` (pastille ronde numérotée, à la couleur du voyage si `--trip` est posé).

### Espacements, rayons, ombres, mouvement

- Espacements base 4 : `--sp-1` 4 … `--sp-16` 64 ; `--gutter` (16 px) = marge latérale sur téléphone.
- Rayons : `--r-xs` 6, `--r-sm` 10 (champs), `--r-md` 14 (lignes, vignettes), `--r-lg` 18 (cartes),
  `--r-xl` 22 (feuilles), `--r-full` (boutons, pastilles, filtres).
- Ombres neutres, jamais teintées : `--shadow-sm`, `--shadow-md`, `--shadow-lg` (menus flottants),
  `--shadow-float` (cartes sur photo).
- Mouvement : `--ease` (sortie douce), `--ease-in-out` ; durées `--dur-fast` 120 ms (appui), `--dur` 200 ms
  (état), `--dur-slow` 360 ms (feuilles, couverture). `prefers-reduced-motion` coupe tout (base.css).

## 3. Couleurs de voyage

### La palette

Source unique : **`server/trip-palette.ts`** (identifiants stables, stockés en base). Le site l'importe
(`web/trip-colors.ts`) et `tokens.css` en recopie les valeurs ; `web/trip-colors.test.ts` vérifie la concordance.
`GET /api/trip-colors` l'expose aussi.

| Id | Nom | Clair | Sombre | Texte clair | Texte sombre |
| --- | --- | --- | --- | --- | --- |
| `coral` | Corail | `#CD443D` | `#E87162` | `#C94039` | `#E87162` |
| `amber` | Ambre | `#C97B00` | `#E49E38` | `#A26202` | `#E49E38` |
| `moss` | Mousse | `#4F7205` | `#B6E27B` | `#4F7205` | `#B6E27B` |
| `pine` | Pin | `#2D8D64` | `#66C58F` | `#1A8058` | `#66C58F` |
| `lagoon` | Lagon | `#1E999C` | `#68E3DE` | `#067D7F` | `#68E3DE` |
| `azure` | Azur | `#2F8ADC` | `#7DCBFE` | `#0D74C4` | `#7DCBFE` |
| `indigo` | Indigo | `#3E309F` | `#796CD1` | `#3E309F` | `#7F72D8` |
| `lilac` | Lilas | `#A04AA3` | `#C781CB` | `#A04AA3` | `#C781CB` |
| `raspberry` | Framboise | `#A11056` | `#D85584` | `#A11056` | `#D85584` |
| `slate` | Ardoise | `#5B646F` | `#9BA6B1` | `#5B646F` | `#9BA6B1` |

La teinte pleine atteint 3:1 sur la page (éléments graphiques) ; la version « texte » atteint 4,5:1 sur `--bg`
et `--surface`. Ardoise sert aux couvertures presque sans couleur et aux voyages pas encore calculés.

### D'où vient la couleur d'un voyage (serveur)

- Base (migration **v8**) : `trip.color` (choix manuel, `NULL` = automatique) et `trip.auto_color`.
- `server/trip-colors.ts` : la miniature de la couverture effective est réduite à 96 px ; les pixels passent en
  OKLCH ; histogramme de teintes pondéré par la vibrance ; moyenne autour du pic ; arrondi à la teinte la plus
  proche. Règle anti-doublon : du plus ancien voyage au plus récent, une teinte déjà prise cède la place à une
  voisine libre (45°, puis 80°) ; au-delà, doublon accepté. Les couleurs manuelles comptent comme prises. Les
  voyages sans préférence (couverture grise ou absente) passent en dernier : Ardoise, puis la moins employée.
- Recalcul en arrière-plan à chaque recalcul des voyages, changement de couverture, réaction (la photo la plus
  réagie peut devenir la couverture) et choix de couleur ; au démarrage pour les voyages existants.
- API : chaque voyage (liste et détail) porte `color` (effective, toujours un id de la palette), `colorAuto`
  (true = suit la couverture) et `autoColor` (ce que donnerait « Automatique »).
  `PUT /api/trips/:slug/color` avec `{ "color": "coral" }` ou `{ "color": null }` (Automatique) ; erreur
  `400 invalid_color`, `404 trip_not_found`. Côté site : `api.setTripColor(slug, color)`.

### Où la couleur apparaît

| Endroit | Ce qui prend la couleur | Ce qui ne la prend pas |
| --- | --- | --- |
| Globe | ligne d'itinéraire (avec un liseré `--bg`), points d'étape (le dernier plus gros), pastilles de la légende | le globe lui-même (gris), les libellés (texte) |
| Liste des voyages | pastille devant le titre, mini-route sous la date, étiquette au nom de la couleur à droite, survol de la ligne (7 %) ; filtres par couleur en haut | la vignette, le titre |
| Page d'un voyage | fond de page teinté (`--trip-page`), route sous le titre, étapes (pastilles et trait), boutons secondaires (`color-mix` 16 %), pastille du sélecteur en haut | le bouton principal (reste Encre) |
| Sélecteur | « Automatique » + dix pastilles | — |

### Utilisation côté site

```tsx
import { tripColorProps, tripStyle, tripColorHex } from "../trip-colors.js";

<li {...tripColorProps(trip.color)}> … </li>       // pose data-trip-color + --trip, --trip-text
<span style={tripStyle(trip.color)}> … </span>      // variables seules, sans --trip-page/--trip-soft
tripColorHex(trip.color)                            // hexadécimal du thème courant (MapLibre, canvas)
```

Sous un élément `data-trip-color`, les descendants disposent de `--trip` (pastille, trait), `--trip-text`
(texte), `--trip-page` (fond de page, 11 % clair / 17 % sombre, en OKLab) et `--trip-soft` (fond d'étiquette).
MapLibre ne lit pas le CSS : passer `tripColorHex(color)` (et le recalculer au changement de thème).

## 4. Logo

Le **chemin en W** (direction Horizon, version Encre) : un départ en point plein, deux vallées, une arrivée en
épingle corail évidée. Géométrie unique : `web/brand.ts`.

- `<Logo size={28} />` (`web/components/Logo.tsx`) : le glyphe, trait en `currentColor` (Encre par défaut),
  épingle `--brand-pin`. Décoratif sauf si `label` est fourni.
- `<Wordmark size={26} />` : glyphe + « Waysake » en Geist SemiBold, approche -0,045 em.
- Fichiers : `docs/design/assets/` (`logo-glyph(-dark).svg`, `logo-wordmark(-dark).svg` vectorisé,
  `app-icon.svg`, `app-icon-512.png`), `web/public/` (favicon.svg, favicon.ico, apple-touch-icon.png),
  `apps/mobile/assets/` (icône, icône adaptative avant-plan/fond/monochrome, splash, favicon).
- **Tout se régénère** avec `pnpm tsx scripts/build-brand-assets.ts` après une retouche de `web/brand.ts`.
- Icône d'app : tuile graphite (`#3A3A40` → `#121214`), glyphe blanc, épingle `#E87162`. Fond de démarrage et
  de l'icône adaptative : `#1B1B1E`.
- Espace de protection : au moins la hauteur de l'épingle autour du glyphe. Ne pas recolorer l'épingle, ne pas
  poser le logo sur une photo sans fond.

## 5. Composants disponibles

| Composant | Fichier | Rôle |
| --- | --- | --- |
| `Logo`, `Wordmark` | `components/Logo.tsx` | marque (barre latérale, connexion, profils, globe) |
| `TripColorDot` | `components/TripColor.tsx` | pastille ronde devant un titre (décorative, ou `labelled`) |
| `TripColorTag` | idem | étiquette au nom de la couleur (liste) |
| `TripColorFilter` | idem | puce de filtre (« Tous » sans `color`, active = Encre) |
| `TripColorPicker` | idem | sélecteur : Automatique (d'après la couverture) + 10 teintes ; `value` null = auto |
| `tripColorName(color)` | idem | nom traduit (« Corail », « Coral ») |
| `.title`, `.step-number` | `styles/base.css` | titres sobres, numéros d'étape |
| `.button`, `.button--quiet`, `.button--small`, `.button--danger`, `.icon-button(--glass)`, `.field`, `.empty`, `.skeleton` | `styles/base.css` | existants, repeints en Encre |

Clés i18n : `tripColor.*` (titre, auto, noms) et `api.invalid_color`, en français et en anglais.

## 6. Recettes Horizon (maquettes validées)

- **Couverture : la photo d'abord** (retours de Marius, oct. 2026). La photo est nette sur presque toute sa
  hauteur ; seul son bas se fond dans la page par un flou progressif (calque `backdrop-filter: blur(18px)` sur
  le dernier quart, masqué vers le haut, plus un dégradé vers `--trip-page`). Téléphone : couverture de
  `min(118vw, 72svh)`, titre (30 → 40 px), dates, chiffres et route **sous** la photo. Grand écran : couverture
  de `min(86vh, 900px)`, texte compact (`--fs-3xl`) posé dans la bande floutée du bas, actions à droite.
  Les chiffres sont une ligne de métadonnées (`21 jours · 70 photos · …`, nombre en `--text` 600), pas un tableau.
- **Actions d'une page** : une rangée de 44 px — le bouton Encre avec libellé, les secondaires en boutons ronds
  teintés (icône seule sur téléphone, libellé dès 520 px de large).
- **Photos plein écran** (visionneuse, diaporama, jeu) : la photo prend toute la place ; le chrome n'a pas de
  bandeau ; les détails (légende, réactions, actions) sont repliés derrière un bouton « i » et s'ouvrent au toucher.
- **Cartes de voyage** (globe) : la couverture entière en 3:2, sans texte dessus ; pastille, titre et dates dessous.
- **Zone de toucher** : 44 px de haut pour tout bouton (`.button` a `min-height: 44px` ; `.button--small` aussi
  sur écran tactile), boutons d'un même groupe à la même hauteur.
- **Route sous le titre** : étapes en petits cercles évidés (bord 1,6 px `--trip`, fond `--trip-page`), la
  dernière pleine, reliées par des traits de 1,6 px ; sur écran étroit, seuls la première et la dernière gardent
  leur nom.
- **Étapes** : liste verticale, trait de 2 px `--trip` à 55 %, pastilles de 10 px évidées, la dernière pleine.
- **Boutons ronds sur photo** : `.icon-button--glass` (`--scrim` + flou).
- **Liste** : lignes de 72 px de vignette (`--r-md`), titre 15,5 px 600, métadonnées 12,5 px `--text-muted`,
  regroupées par année (15 px 600 `--text-muted`).

## 7. Écrans à refaire (phase 2)

Phase 1 n'a fait que le remplacement minimal (jetons, police, logo, plus de panneau). Chaque écran doit devenir :

| Écran | Fichier | Ce qu'il doit devenir |
| --- | --- | --- |
| Globe (accueil) | `screens/Globe.tsx`, `components/GlobeMap.tsx` | globe gris neutre ; **itinéraire de chaque voyage en sa couleur** (ligne + liseré, points d'étape, dernier point plus gros) ; légende flottante (pastille, nom, dates, nom de la couleur) ; `Wordmark` + « n voyages · n pays » en haut à gauche ; cartes de voyage du bas avec pastille |
| Liste des voyages | `screens/Trips.tsx`, `components/TripCard.tsx` | titre « Voyages » (`--fs-2xl`, 650) + sous-titre ; **filtres par couleur** (`TripColorFilter`, « Tous » puis les couleurs présentes) ; lignes groupées par année : vignette 72 px, `TripColorDot` + titre, dates · étapes · photos, mini-route, `TripColorTag` à droite |
| Page d'un voyage | `screens/Trip.tsx` (+ `TripMap`, `TripStatsPanel`, `NoteEditor`) | fond `--trip-page` avec la couverture très floutée ; **couverture à flou progressif** ; titre display, dates · pays, route ; chiffres (jours, photos, étapes, km) ; bouton Encre « Regarder ensemble » + bouton secondaire teinté « Où était-ce ? » ; étapes en petite route ; grille de photos ; **pastille de couleur en haut à droite qui ouvre `TripColorPicker`** (aujourd'hui accessible par le menu « … » du voyage, dans une feuille, déjà branché sur `api.setTripColor`) |
| Validation d'un import | `screens/ImportReview.tsx` | carte du voyage proposé avec la même couverture Horizon, couleur proposée visible |
| Diaporama | `screens/Slideshow.tsx` | reste sur fond noir ; titres Geist ; route et progression à la couleur du voyage (`tripColorHex`) |
| Photos | `screens/Library.tsx`, `components/PhotoGrid.tsx`, `Viewer.tsx` | grille sobre, en-têtes Geist, rappel « à localiser » en `--warning` discret |
| À localiser | `screens/Locate.tsx`, `PlacePicker.tsx` | jours en titres Geist, actions Encre |
| Carnet | `screens/Notebook.tsx`, `MemoryCard.tsx` | souvenirs avec pastille du voyage concerné |
| Pays | `screens/Countries.tsx` | cartes neutres, drapeau, nombre de voyages |
| Jeux | `screens/Games.tsx`, `GamePlay.tsx`, `GuessMap.tsx` | cartes de mode sans panneau ; épingle de réponse Encre ; scores en Geist tabulaire |
| Statistiques | `screens/Stats.tsx` | graphiques en Encre et gris, avertissement en `--warning` |
| Obtenir l'app | `screens/GetApp.tsx`, `BadgeSheet.tsx` | étapes numérotées `.step-number`, QR sur blanc |
| Profils, connexion | `screens/ProfilePicker.tsx`, `Login.tsx` | déjà `Wordmark` ; avatars : couleurs du profil (par défaut prises dans la palette, sans vert) |
| Coquille | `shell/Shell.tsx`, `components/Header.tsx`, `Sheet.tsx` | barre latérale avec `Logo` (fait) ; onglets façon maquette (icônes 20 px, onglet actif `--text` plein) ; en-têtes « grand titre » en Geist 650 ; feuilles `--r-xl`, fond `--overlay` |
| Partage en direct | `components/LiveInvite.tsx`, `LiveOverlay.tsx` | point « en direct » `--success`, barre `--scrim` |
| Carte postale (image) | `server/postcard.ts` | panneau remplacé par la couverture Horizon ; texte en Geist (woff dans `server/assets/fonts`) ; route à la couleur du voyage. Aujourd'hui : panneau repeint en Encre, Barlow conservé |
| App Android | `apps/mobile` | couleurs Encre faites (`src/theme.ts`) ; reste : passer de Barlow Condensed à Geist (`expo-font`), remplacer `Sign` de `src/components.tsx` par le `Wordmark` |

## 8. Règles pour la phase 2

- Une couleur de voyage n'apparaît **que** sous un élément qui appartient à ce voyage (`tripColorProps`).
- Jamais de couleur seule : nom du voyage ou nom de la couleur à côté (légende, étiquette, `aria-label`).
- Le bouton principal reste Encre, même sur une page teintée (contraste ≥ 4,5:1 sur toutes les teintes).
- Texte coloré : toujours `--trip-text`, jamais `--trip`.
- Photos : jamais recadrées en dessous de 58 px de côté dans une liste ; pas de filtre de couleur sur une photo
  (le flou de fond est la seule exception).
- Vérifier chaque écran en clair et en sombre, à 400 px et à 1280 px.
