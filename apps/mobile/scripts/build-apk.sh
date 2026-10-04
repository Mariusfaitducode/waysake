#!/usr/bin/env bash
# Construit l'APK signé d'Atlas et le copie dans ../../dist/atlas.apk (servi par la tour sur /app).
set -euo pipefail
cd "$(dirname "$0")/.."
# Clé de signature : la tienne (keytool -genkeypair -alias atlas ...), mots de passe via l'environnement.
KEYSTORE="${ATLAS_KEYSTORE:-$HOME/.atlas/atlas-release.keystore}"
: "${ATLAS_STORE_PASSWORD:?Définis ATLAS_STORE_PASSWORD (mot de passe de la keystore)}"
npx expo prebuild -p android --no-install
(cd android && ./gradlew assembleRelease --console=plain \
  -PATLAS_STORE_FILE="$KEYSTORE" -PATLAS_STORE_PASSWORD="$ATLAS_STORE_PASSWORD" \
  -PATLAS_KEY_ALIAS=atlas -PATLAS_KEY_PASSWORD="${ATLAS_KEY_PASSWORD:-$ATLAS_STORE_PASSWORD}")
mkdir -p ../../web/public
cp android/app/build/outputs/apk/release/app-release.apk ../../web/public/atlas.apk
echo "APK : web/public/atlas.apk ($(du -h ../../web/public/atlas.apk | cut -f1))"
