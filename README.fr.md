<p align="right"><a href="README.md">English</a> · <b>Français</b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/design/assets/logo-glyph-dark.svg">
    <img src="docs/design/assets/logo-glyph.svg" width="88" alt="Logo de Waysake">
  </picture>
</p>

<h1 align="center">Waysake</h1>

<p align="center"><b>Your trips, kept.</b></p>

<p align="center"><i>Immich organizes your photos. Waysake keeps the journey.</i></p>

<p align="center">
  <a href="https://github.com/Mariusfaitducode/waysake/releases/download/v0.2.0/waysake-demo.mp4">
    <img src="docs/media/waysake-loop.gif" width="720" alt="Waysake en quelques secondes : le globe, un voyage et le jeu « Où était-ce ? »">
  </a>
</p>

<p align="center">
  <a href="https://github.com/Mariusfaitducode/waysake/releases/download/v0.2.0/waysake-demo.mp4"><b>▶ Voir la démo de 50 secondes</b></a>
</p>

Waysake est un drive de voyages auto-hébergé, pour un couple ou une famille. Vous lui envoyez vos photos ; il
les range en voyages et en étapes sur un globe, avec l'itinéraire, les pays découverts et votre carnet. Il tourne
sur un ordinateur chez vous, dans un seul conteneur Docker. Pas de cloud, pas de compte.

Nous l'avons fait pour nous deux, pour revoir nos voyages comme nous les avons vécus : dans l'ordre, lieu par lieu.

<table>
  <tr>
    <td width="33%"><img src="docs/media/screen-globe.jpg" alt="Le globe avec chaque voyage et son itinéraire"></td>
    <td width="33%"><img src="docs/media/screen-trip.jpg" alt="Une page de voyage : dates, pays, étapes, Regarder ensemble, diaporama et carte postale"></td>
    <td width="33%"><img src="docs/media/screen-games.jpg" alt="Le jeu « Où était-ce ? »"></td>
  </tr>
</table>

<sub>Captures de l'interface en anglais ; Waysake est aussi entièrement en français.</sub>

## Ce qu'il fait

- **Les voyages trouvés pour vous** : les photos sont regroupées par dates et par lieux en voyages et en étapes (géocodage hors ligne) ; vous validez.
- **Un globe de vos voyages** : les itinéraires, les pays découverts, et une couleur pour chaque voyage.
- **Import depuis le téléphone** : l'app Android envoie une période ou des mois choisis, en gardant le GPS de chaque photo.
- **« Où était-ce ? »** : un jeu à deux. Devinez où une photo a été prise, ou mettez-vous d'accord sur un lieu pour les photos qui n'en ont pas.
- **Regarder ensemble** : suivez en direct les photos d'un voyage sur deux téléphones, ou lancez-le en diaporama.
- **Chez vous** : originaux jamais modifiés, mot de passe du foyer, des profils plutôt que des comptes, en français et en anglais.

## Démarrage rapide

Il vous faut [Docker](https://docs.docker.com/get-docker/).

```bash
mkdir waysake && cd waysake
curl -fsSLO https://raw.githubusercontent.com/Mariusfaitducode/waysake/main/docker-compose.yml
WAYSAKE_PROFILES="Léa, Tom" WAYSAKE_PASSWORD="un-mot-de-passe" docker compose up -d
```

Ouvrez ensuite `http://<votre-ordinateur>:8420`, choisissez votre profil et ajoutez quelques photos. L'image
tourne sur PC, Mac, Raspberry Pi et NAS (amd64 et arm64).

## L'installer avec un assistant IA

Si vous utilisez [Claude Code](https://claude.com/claude-code) ou un autre agent de code, collez-lui ce prompt.
Il vous guidera dans l'installation sur votre propre machine, une étape à la fois.

```text
Aide-moi à installer Waysake, un drive de photos de voyage auto-hébergé
(https://github.com/Mariusfaitducode/waysake), sur cette machine. Guide-moi pas à pas, explique chaque étape
en mots simples avant de la faire, et attends ma réponse chaque fois que tu as besoin d'un choix de ma part.

Règles :
- Demande ma confirmation avant toute action irréversible ou qui touche tout le système : installer un
  logiciel, supprimer ou déplacer des fichiers, modifier le pare-feu ou le réseau, écraser un fichier existant.
- N'expose jamais Waysake sur Internet, et jamais sans HTTPS. Réseau privé ou Tailscale uniquement.
- Ne réaffiche jamais mon mot de passe en entier, et ne le commite nulle part.

Étapes :
1. Vérifie que Docker et Docker Compose fonctionnent (`docker compose version`). Sinon, explique-moi comment
   installer Docker sur mon système et attends que ce soit fait.
2. Demande-moi où Waysake doit garder ses données (mes photos, les miniatures et la base). Propose un dossier
   sur un disque avec assez de place, et montre-moi l'espace libre.
3. Demande-moi les prénoms des personnes du foyer (pour WAYSAKE_PROFILES, ex. "Léa, Tom") et un mot de passe
   du foyer (WAYSAKE_PASSWORD).
4. Crée un dossier `waysake`. Télécharges-y
   https://raw.githubusercontent.com/Mariusfaitducode/waysake/main/docker-compose.yml, et écris à côté un
   fichier `.env` avec WAYSAKE_DATA, WAYSAKE_PROFILES et WAYSAKE_PASSWORD. Restreins les droits du `.env` à
   mon utilisateur.
5. Démarre avec `docker compose up -d`, puis interroge `http://localhost:8420/api/health` jusqu'à ce qu'il
   réponde `"ok":true`. Sinon, lis `docker compose logs` et aide-moi à corriger.
6. Demande-moi si je veux accéder à Waysake depuis nos téléphones. Si oui, propose Tailscale : aide-moi à
   l'installer, puis lance `tailscale serve --bg 8420` et `tailscale serve status` pour obtenir l'adresse
   https privée.
7. Explique les téléphones : sur Android, l'app Waysake (téléchargeable depuis `<adresse>/app` une fois son
   APK déposé dans `<dossier de données>/app/waysake.apk`) importe les photos avec leur GPS ; sur iPhone,
   utiliser Safari et « Sur l'écran d'accueil ».
8. Explique la sauvegarde : Waysake garde 7 instantanés quotidiens de sa base dans
   `<dossier de données>/backups`, mais une seule copie des photos n'est pas une sauvegarde. Aide-moi à prévoir
   une copie de tout le dossier de données sur un autre disque.
9. Propose les mises à jour automatiques. Sous Linux ou sur un NAS : Watchtower qui surveille le conteneur
   `atlas`. Sinon : montre-moi `docker compose pull && docker compose up -d` et propose de le planifier.
10. Termine par un court résumé : l'adresse, où sont les données, comment mettre à jour, comment l'arrêter.
```

<details>
<summary><b>Configuration</b></summary>

Ces réglages se donnent dans le terminal, ou dans un fichier `.env` à côté du `docker-compose.yml` pour ne pas
les retaper.

| Variable | Par défaut | Rôle |
|---|---|---|
| `WAYSAKE_DATA` | `./atlas-data` | Le dossier des photos et de la base, ex. `/mnt/photos/waysake`, ou `D:/Waysake` sous Windows. |
| `WAYSAKE_PROFILES` | deux profils d'exemple, Alex et Sam | Les personnes du foyer, avec une couleur facultative : `"Léa:#3E309F, Tom:#2F8ADC"`. Un profil ajouté plus tard est créé au redémarrage. Un profil n'est jamais supprimé, car des photos y sont rattachées. |
| `WAYSAKE_PASSWORD` | aucun | Le mot de passe du foyer (voir Sécurité). Vide : tout le réseau peut utiliser Waysake. |

Waysake écoute sur le port **8420** et redémarre avec la machine (`restart: unless-stopped`). Les anciens noms
`ATLAS_*`, d'avant le changement de nom du projet, restent acceptés. Pour construire l'image vous-même depuis un
clone du dépôt : `docker compose up -d --build`.

</details>

<details>
<summary><b>Sur le téléphone</b></summary>

Pour ouvrir Waysake à vos téléphones, en privé et en HTTPS, utilisez [Tailscale](https://tailscale.com) :

```bash
tailscale serve --bg 8420
tailscale serve status   # affiche https://<machine>.<tailnet>.ts.net
```

- **Android** : construire l'APK (voir Développer) et le déposer dans `<WAYSAKE_DATA>/app/waysake.apk` ; il se
  télécharge alors depuis `https://<adresse>/app`. Dans l'app, taper l'adresse de Waysake (et le mot de passe
  s'il y en a un), choisir son profil et autoriser l'accès **complet** aux photos : c'est ce qui garde les lieux.
  Pour importer, choisir une période (depuis le dernier import, les 30 derniers jours, des dates, ou mois par
  mois), puis envoyer.
- **iPhone** : Waysake s'utilise dans Safari (*Partager → Sur l'écran d'accueil*). iOS retire le GPS des photos
  envoyées par le navigateur ; elles arrivent dans *À localiser*, où l'on pose un lieu sur une journée ou un
  moment entier d'un coup.

Après chaque import, Waysake propose les voyages et les étapes, met de côté les captures d'écran et les photos
prises à la maison, et vous validez.

</details>

<details>
<summary><b>Sauvegardes</b></summary>

Tout est dans le dossier `WAYSAKE_DATA` : les originaux (jamais modifiés), les miniatures et la base SQLite.

- **Chaque jour**, Waysake fait un instantané de sa base dans `WAYSAKE_DATA/backups` et garde les 7 derniers.
  Cela protège vos notes, lieux et titres d'une erreur, pas d'une panne du disque.
- **Sur un autre disque** : une seule copie de vos photos, c'est zéro copie. Copiez tout le dossier de données
  sur un disque externe ou avec votre outil de sauvegarde habituel. Pour une tour Windows,
  `scripts/install-backup.sh moi@tour E:/` installe une copie chaque nuit vers un disque externe (rien n'est
  jamais supprimé de la sauvegarde ; journal dans `WAYSAKE_DATA\backup.log`).
- **Restaurer** : Waysake arrêté, recopier la sauvegarde dans le dossier de données, puis renommer le dernier
  `backups/atlas-AAAA-MM-JJ.db` en `atlas.sqlite`.

</details>

<details>
<summary><b>Mises à jour automatiques</b></summary>

Chaque fusion sur `main` passe par la CI : tests, types, compilation, puis un test de fumée de l'image Docker
(démarrée sur un dossier vide ; santé, site et API doivent répondre). Seule une image qui a tout passé est
publiée en `:latest`. Les pull requests sont testées de la même façon mais ne publient jamais.

Pour mettre à jour à la main : `docker compose pull && docker compose up -d`. Pour suivre `:latest` tout seul :

- **[Watchtower](https://containrrr.dev/watchtower/)** (toute machine Linux, NAS…) : simple, mais sans
  sauvegarde de la base ni retour arrière.
  ```bash
  docker run -d --name watchtower --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock \
    containrrr/watchtower --cleanup --interval 300 atlas
  ```
- **Tour Windows** (Docker Desktop) : `scripts/install-autoupdate.sh moi@tour C:/Atlas` installe une tâche
  planifiée. Toutes les 2 minutes, elle cherche une nouvelle image ; s'il y en a une, elle sauvegarde la base,
  remplace le conteneur, vérifie sa santé et **revient à la version précédente** en cas de problème. `--status`
  affiche l'état, `--off` la désactive.

Pourquoi le serveur va chercher l'image plutôt que GitHub ne pousse un déploiement : sur un dépôt public, un
runner GitHub Actions auto-hébergé exécuterait sur votre machine le code de n'importe quelle pull request venue
d'un fork. Votre serveur n'expose rien et ne télécharge qu'une image déjà validée par la CI. `/api/health`
indique la version qui tourne.

</details>

<details>
<summary><b>Sécurité</b></summary>

- Définissez un **mot de passe du foyer** avec `WAYSAKE_PASSWORD` (recommandé). Toute l'API et toutes les photos
  le demandent alors, une fois par appareil (session d'un an ; l'app Android le garde). Changer le mot de passe
  déconnecte tous les appareils. Ensuite, chacun choisit simplement son profil : il n'y a pas de comptes. Un
  client sans navigateur (script, raccourci) envoie `Authorization: Bearer <mot de passe>`.
- Waysake est fait pour un réseau privé : votre Wi-Fi, ou Tailscale depuis vos téléphones. **Ne l'exposez pas
  directement sur Internet**, et jamais sans HTTPS : le mot de passe circulerait en clair.
- Aucune télémétrie. Les seules requêtes sortantes sont les tuiles des cartes de voyage
  ([OpenFreeMap](https://openfreemap.org/)).

Une faille de sécurité ? Merci d'ouvrir une
[alerte de sécurité privée](https://github.com/Mariusfaitducode/waysake/security/advisories/new) plutôt qu'un ticket public.

</details>

<details>
<summary><b>Développer</b></summary>

```bash
pnpm install
pnpm seed      # jeu de démonstration
pnpm dev       # API sur :8420, site sur :5173
pnpm test
```

Pile : Node, TypeScript, Fastify, SQLite (better-sqlite3), React, Vite, MapLibre ; ffmpeg pour les vidéos.

App Android : `apps/mobile` (Expo). Pour un APK signé, créez votre clé, puis construisez :

```bash
keytool -genkeypair -v -keystore ~/.atlas/atlas-release.keystore -alias atlas \
  -keyalg RSA -keysize 2048 -validity 10000
ATLAS_STORE_PASSWORD=... apps/mobile/scripts/build-apk.sh
```

Bientôt : lire votre bibliothèque [Immich](https://immich.app) existante, pour ne pas envoyer vos photos deux fois.

</details>

<details>
<summary><b>Comment Waysake est construit</b></summary>

Waysake est développé avec l'assistant de code [Claude Code](https://claude.com/claude-code) : la plupart des
commits sont co-signés par Claude. Ce n'est pas du code généré puis abandonné. Je l'utilise avec ma compagne, je
relis et je teste chaque changement sur notre propre bibliothèque de photos. Le serveur est couvert par plus de
200 tests automatisés, et les changements sensibles (authentification, import, fichiers) passent par une revue
de sécurité dédiée. Les tickets et les critiques sont les bienvenus.

</details>

<details>
<summary><b>Licence et crédits</b></summary>

[AGPL-3.0-or-later](LICENSE). Vous pouvez utiliser, modifier et redistribuer Waysake librement ; si vous hébergez
une version modifiée pour d'autres, vous devez en publier le code.

- Photos de démo : photos sous licence libre de Wikimedia Commons et Flickr, créditées dans
  [docs/demo-photos.md](docs/demo-photos.md). `pnpm seed` les télécharge une fois dans `~/.cache/waysake-demo/`.
- Données de lieux : [GeoNames](https://www.geonames.org/) (CC BY 4.0) et [Natural Earth](https://www.naturalearthdata.com/) (via [world-atlas](https://github.com/topojson/world-atlas)).
- Tuiles : [OpenFreeMap](https://openfreemap.org/), © les contributeurs d'[OpenStreetMap](https://www.openstreetmap.org/copyright).

</details>
