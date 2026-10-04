#!/usr/bin/env bash
# Met en ligne waysake.com (landing + démo interactive sur /app) sur Vercel.
#   scripts/deploy-site.sh          (la CLI Vercel doit être connectée : `vercel login`)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▸ Démo statique (/app)"
DEMO_BASE=/app/ pnpm build:demo
rm -rf site/app && cp -R dist-demo site/app
echo "▸ Déploiement Vercel (projet waysake)"
cd site
[ -f .vercel/project.json ] || vercel link --yes --project waysake
vercel deploy --prod --yes
