#!/usr/bin/env bash
# Construit l'APK signé de Waysake et le copie dans ../../web/public/waysake.apk (servi par la tour sur /app).
set -euo pipefail
cd "$(dirname "$0")/.."
# Clé de signature : la tienne (keytool -genkeypair -alias atlas ...), mots de passe via l'environnement.
# Les noms ATLAS_* (variables, alias « atlas », ~/.atlas/atlas-release.keystore) datent d'avant le changement
# de nom et restent tels quels : Android n'installe une mise à jour que si elle est signée par la même clé.
KEYSTORE="${ATLAS_KEYSTORE:-$HOME/.atlas/atlas-release.keystore}"
: "${ATLAS_STORE_PASSWORD:?Définis ATLAS_STORE_PASSWORD (mot de passe de la keystore)}"
npx expo prebuild -p android --no-install
(cd android && ./gradlew assembleRelease --console=plain \
  -PATLAS_STORE_FILE="$KEYSTORE" -PATLAS_STORE_PASSWORD="$ATLAS_STORE_PASSWORD" \
  -PATLAS_KEY_ALIAS=atlas -PATLAS_KEY_PASSWORD="${ATLAS_KEY_PASSWORD:-$ATLAS_STORE_PASSWORD}")
mkdir -p ../../web/public
cp android/app/build/outputs/apk/release/app-release.apk ../../web/public/waysake.apk
echo "APK : web/public/waysake.apk ($(du -h ../../web/public/waysake.apk | cut -f1))"
