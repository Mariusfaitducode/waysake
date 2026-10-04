#!/usr/bin/env bash
# Test de fumée d'une image Docker de Waysake : la démarre sur un dossier de données vide et vérifie qu'elle sert
# vraiment (santé, site, API), sans redémarrer en boucle. La CI ne publie l'image que si ce test passe.
#   scripts/smoke-image.sh waysake:smoke                       (image déjà construite)
#   EXPECT_COMMIT=ca84a25 scripts/smoke-image.sh waysake:smoke (vérifie aussi la version annoncée)
# Variables : SMOKE_PORT (18420 par défaut), SMOKE_TIMEOUT en secondes (120).
set -euo pipefail
IMAGE="${1:?Usage : scripts/smoke-image.sh image[:tag]}"
PORT="${SMOKE_PORT:-18420}"
TIMEOUT="${SMOKE_TIMEOUT:-120}"
NAME="waysake-smoke-$$"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/waysake-smoke.XXXXXX")"
BASE="http://127.0.0.1:$PORT"

cleanup() {
  docker rm -f "$NAME" > /dev/null 2>&1 || true
  # Les fichiers créés par le conteneur appartiennent à root sous Linux : on les efface depuis le conteneur.
  docker run --rm -v "$DATA:/d" --entrypoint sh "$IMAGE" -c 'rm -rf /d/* /d/.[!.]*' > /dev/null 2>&1 || true
  rm -rf "$DATA" 2> /dev/null || true
}
trap cleanup EXIT

fail() {
  echo "ÉCHEC : $1"
  echo "--- journal du conteneur ---"
  docker logs --tail 80 "$NAME" 2>&1 || true
  exit 1
}

state() { docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}}' "$NAME" 2> /dev/null || echo "absent - -"; }

# Même réglages que docker-compose.yml (redémarrage automatique, volume /data), mais la vérification de santé
# tourne toutes les 2 s au lieu de 30 s pour ne pas attendre.
docker run -d --name "$NAME" --restart unless-stopped -p "127.0.0.1:$PORT:8420" -v "$DATA:/data" \
  --health-interval 2s --health-start-period 60s "$IMAGE" > /dev/null
echo "Conteneur $NAME démarré ($IMAGE), données : $DATA"

deadline=$((SECONDS + TIMEOUT))
while :; do
  read -r status health restarts <<< "$(state)"
  [ "$restarts" = 0 ] || fail "le conteneur a redémarré ($restarts fois) : il plante au démarrage."
  case "$status" in running | created) ;; *) fail "le conteneur est « $status »." ;; esac
  [ "$health" = healthy ] && break
  [ "$health" = unhealthy ] && fail "Docker le juge en mauvaise santé."
  [ "$SECONDS" -lt "$deadline" ] || fail "toujours pas en bonne santé après ${TIMEOUT} s (état : $status/$health)."
  sleep 2
done
echo "  santé Docker : healthy après ${SECONDS} s"

HEALTH="$(curl -fsS "$BASE/api/health")" || fail "/api/health ne répond pas."
echo "  /api/health : $HEALTH"
case "$HEALTH" in *'"ok":true'*) ;; *) fail "/api/health ne dit pas ok." ;; esac
if [ -n "${EXPECT_COMMIT:-}" ]; then
  case "$HEALTH" in *"\"commit\":\"$EXPECT_COMMIT\""*) ;; *) fail "/api/health n'annonce pas le commit $EXPECT_COMMIT." ;; esac
fi

check() { # check <chemin> <texte attendu dans la réponse>
  local body code
  body="$(curl -sS -o - -w '\n%{http_code}' "$BASE$1")" || fail "$1 injoignable."
  code="${body##*$'\n'}"
  body="${body%$'\n'*}"
  [ "$code" = 200 ] || fail "$1 répond $code."
  case "$body" in *"$2"*) ;; *) fail "$1 ne contient pas « $2 »." ;; esac
  echo "  $1 : 200"
}
check / '<div id="root">'
check /api/users '"name"'           # profils créés dans la base neuve
check /api/trips '['
check /api/stats/overview '{'
check /api/geo/countries.geojson 'FeatureCollection'

[ -f "$DATA/atlas.sqlite" ] || fail "la base n'a pas été créée dans le dossier de données."
echo "  base créée dans le dossier de données"

# Une image qui plante un peu après le démarrage (tâche différée) doit aussi être refusée.
sleep 5
read -r status health restarts <<< "$(state)"
[ "$status $restarts" = "running 0" ] || fail "le conteneur ne tient pas (état : $status, redémarrages : $restarts)."
echo "OK : l'image $IMAGE démarre et sert Waysake."
