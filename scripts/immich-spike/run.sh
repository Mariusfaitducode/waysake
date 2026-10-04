#!/bin/sh
# Lance une stack Immich v3.2.4 jetable, exécute le spike, puis la supprime.
#   scripts/immich-spike/run.sh                                  → fixtures dans un dossier temporaire
#   FIXTURES=$PWD/test/fixtures/immich scripts/immich-spike/run.sh → régénère les fixtures du dépôt
# Ne touche qu'au projet compose « atlas-immich-spike » (port 127.0.0.1:22883).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
WORK=$(mktemp -d)
cp "$HERE/docker-compose.yml" "$HERE/immich.env" "$WORK/"
cd "$WORK"
compose() { docker compose --env-file immich.env -p atlas-immich-spike "$@"; }
trap 'compose down -v >/dev/null 2>&1; rm -rf "$WORK"' EXIT
compose up -d
URL=http://127.0.0.1:22883/api
i=0
until curl -sf "$URL/server/ping" >/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && { echo "Immich ne répond pas"; exit 1; }
  sleep 3
done
cd "$REPO"
IMMICH_URL=$URL FIXTURES="${FIXTURES:-$WORK/fixtures}" NOTES_DIR="${NOTES_DIR:-$WORK}" \
  ./node_modules/.bin/tsx scripts/immich-spike/spike.ts
