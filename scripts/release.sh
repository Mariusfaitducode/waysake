#!/usr/bin/env bash
# Mise en ligne en une commande, depuis le Mac : vérifications, tests, compilation, déploiement, contrôle de version.
#   scripts/release.sh moi@tour C:/Atlas
#   (ou WAYSAKE_TOWER=moi@tour WAYSAKE_DATA=C:/Atlas scripts/release.sh)
# D'habitude, inutile : une fusion sur main publie l'image testée par la CI, que la tour installe d'elle-même
# (scripts/install-autoupdate.sh). release.sh sert à déployer tout de suite une version pas encore sur main
# (une branche) ; elle reste en service jusqu'à la prochaine image publiée sur main.
set -euo pipefail
TARGET="${1:-${WAYSAKE_TOWER:?Usage : scripts/release.sh utilisateur@tour [dossier-de-données]}}"
DATA="${2:-${WAYSAKE_DATA:-D:/Atlas}}"
cd "$(dirname "$0")/.."
step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }

step "Vérifications"
# Seul le code commité part sur la tour : un changement non commité serait silencieusement oublié.
[ -z "$(git status --porcelain)" ] || { git status --short; echo "Des changements ne sont pas commités : commite-les d'abord."; exit 1; }
git merge-base --is-ancestor main HEAD || { echo "Cette branche ne contient pas main : fusionne main d'abord."; exit 1; }
echo "  $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD) : $(git log -1 --format=%s)"

step "Tests"
pnpm test

step "Compilation"
pnpm build > /dev/null

scripts/deploy-tower.sh "$TARGET" "$DATA"
