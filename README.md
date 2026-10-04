# Atlas

Le drive de voyages auto-hébergé, pensé pour un couple ou une famille. Vos photos se rangent toutes seules en
voyages et en étapes sur un globe, avec l'itinéraire, les pays découverts et votre carnet. Tout tourne chez vous,
sur votre ordinateur : pas de cloud, pas de compte.

- **Voyages automatiques** : Atlas regroupe les photos par dates et par lieux (géocodage hors ligne) et vous
  propose les voyages et leurs étapes. Il ne reste qu'à valider.
- **Globe et itinéraires** : chaque voyage sur la carte, les pays découverts, les photos à leur place.
- **Import depuis le téléphone** : une app Android importe une période entière en gardant le GPS des photos.
- **Photos sans lieu** : un écran « À localiser » pour poser un lieu sur une journée ou un moment, en lot.
- **Carnet** : vos envies de voyage et vos souvenirs écrits.
- **Originaux intacts** : les fichiers ne sont jamais modifiés ; une copie du dossier de données suffit à tout sauvegarder.

## Sécurité

Définissez un **mot de passe du foyer** avec `ATLAS_PASSWORD` (recommandé) : toute l'API et toutes les photos
le demandent alors, une fois par appareil (session d'un an ; l'app Android le garde). Changer le mot de passe
déconnecte tous les appareils. Ensuite, chacun choisit simplement son profil : il n'y a pas de comptes. Un
client sans navigateur (raccourci iPhone, script) envoie l'en-tête `Authorization: Bearer <mot de passe>`.

Atlas reste fait pour un réseau privé (votre Wi-Fi, ou [Tailscale](https://tailscale.com) depuis vos téléphones).
**Ne l'exposez pas nu sur Internet**, et jamais sans HTTPS : le mot de passe circulerait en clair.

## Installer (Docker)

Prérequis : Docker, et Tailscale si vous voulez y accéder hors de chez vous. Rien à compiler : l'image
`ghcr.io/mariusfaitducode/atlas` est prête pour PC, Mac, Raspberry Pi et NAS (amd64 et arm64).

```bash
mkdir atlas && cd atlas
curl -fsSLO https://raw.githubusercontent.com/Mariusfaitducode/atlas/main/docker-compose.yml
ATLAS_PROFILES="Léa, Tom" ATLAS_PASSWORD="un mot de passe" docker compose up -d
```

- `ATLAS_DATA` : le dossier où vivent les photos et la base (par défaut `./atlas-data`, à côté du
  `docker-compose.yml`). Ex. `ATLAS_DATA=/mnt/photos/atlas`, ou `ATLAS_DATA=D:/Atlas` sous Windows.
- `ATLAS_PROFILES` : les profils du foyer, avec une couleur facultative (`"Léa:#0B7A4B, Tom:#1F6FB2"`). Un
  profil ajouté plus tard est créé au redémarrage ; un profil n'est jamais supprimé (les photos y sont rattachées).
  Sans réglage, une base neuve reçoit deux profils d'exemple, « Alex » et « Sam ».
- `ATLAS_PASSWORD` : le mot de passe du foyer (voir « Sécurité »). Vide : Atlas est ouvert à tout le réseau.

Ces réglages peuvent aussi vivre dans un fichier `.env` à côté du `docker-compose.yml`, pour ne pas les retaper.

Atlas écoute sur le port **8420** et redémarre tout seul avec la machine (`restart: unless-stopped`).

Pour l'ouvrir à vos téléphones, en privé et en HTTPS, via Tailscale :
```bash
tailscale serve --bg 8420
tailscale serve status   # affiche l'adresse https://<machine>.<tailnet>.ts.net
```

Pour mettre à jour : `docker compose pull && docker compose up -d`.

Pour construire l'image vous-même, depuis un clone du dépôt : `docker compose up -d --build`.

Sur une machine Windows joignable en SSH, `scripts/deploy-tower.sh utilisateur@machine C:/Atlas` fait tout
depuis un Mac ou un Linux : envoi du code, construction, démarrage et vérification.

## Sur le téléphone

- **Android** : construire l'APK (voir plus bas) et le déposer dans `<ATLAS_DATA>/app/atlas.apk`. Il se
  télécharge alors depuis `https://<adresse>/app`. Dans l'app, taper l'adresse d'Atlas (et le mot de passe s'il y en a un), choisir son profil et
  autoriser l'accès **complet** aux photos : c'est ce qui garde les lieux.
- **iPhone** : Atlas s'utilise dans Safari (`Partager → Sur l'écran d'accueil`). iOS retire le GPS des photos
  envoyées par le navigateur ; un raccourci d'import natif est prévu.

Pour importer : bouton **+**, choisir une période (« Depuis le dernier import », « Les 30 derniers jours »,
« Choisir les dates »), puis **Envoyer à Atlas**. Atlas analyse tout (lieux, dates, captures d'écran, photos
prises à la maison), propose les voyages et les étapes, et vous validez.

## Sauvegarder

Tout est dans le dossier `ATLAS_DATA` : les originaux, les miniatures et la base SQLite. Le copier sur un disque
externe suffit.

## Développer

```bash
pnpm install
pnpm seed      # jeu de démonstration
pnpm dev       # API sur :8420, site sur :5173
pnpm test
```

Pile : Node, Fastify, SQLite (better-sqlite3), React, Vite, MapLibre ; ffmpeg pour les vidéos.

App Android : `apps/mobile` (Expo). Pour un APK signé, créez votre clé
(`keytool -genkeypair -v -keystore ~/.atlas/atlas-release.keystore -alias atlas -keyalg RSA -keysize 2048 -validity 10000`)
puis lancez `ATLAS_STORE_PASSWORD=... apps/mobile/scripts/build-apk.sh`.

## Comment Atlas est construit

Atlas est développé avec l'assistant de code [Claude Code](https://claude.com/claude-code) : la plupart des
commits sont co-signés par Claude. Ce n'est pas du code généré puis abandonné. Je l'utilise avec ma
compagne, je relis et je teste chaque changement sur notre propre bibliothèque de photos. Le serveur est couvert
par plus de 200 tests automatisés, et les changements sensibles (authentification, import, fichiers) passent par
une revue de sécurité dédiée. Les problèmes et les critiques sont les bienvenus dans les tickets.

## Licence

[AGPL-3.0-or-later](LICENSE). Vous pouvez utiliser, modifier et redistribuer Atlas librement ; si vous
hébergez une version modifiée pour d'autres, vous devez en publier le code.
