#!/usr/bin/env bash
# Installe ou met à jour Atlas sur la tour Windows, depuis le Mac, en une commande :
#   scripts/deploy-tower.sh moi@tour            (nom Tailscale de la tour)
#   scripts/deploy-tower.sh moi@tour E:/Atlas   (autre dossier de données)
# Prérequis sur la tour : OpenSSH Server activé (voir README), Docker Desktop démarré, Tailscale connecté.
set -euo pipefail
TARGET="${1:?Usage : scripts/deploy-tower.sh utilisateur@tour [D:/Atlas]}"
DATA="${2:-D:/Atlas}"
cd "$(dirname "$0")/.."
step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
remote() { ssh -o BatchMode=yes "$TARGET" "$1"; }

step "Connexion à la tour"
remote 'Write-Output "OK : $env:COMPUTERNAME"; docker version --format "Docker {{.Server.Version}}"; tailscale version | Select-Object -First 1'

step "Envoi du code (version commitée : $(git rev-parse --short HEAD))"
ARCHIVE="$(mktemp -t atlas).tar"
git archive --format=tar HEAD > "$ARCHIVE"
scp -q "$ARCHIVE" "$TARGET:C:/Atlas-app.tar"
rm -f "$ARCHIVE"
remote "New-Item -ItemType Directory -Force C:\\Atlas-app, $DATA\\app | Out-Null; tar -xf C:\\Atlas-app.tar -C C:\\Atlas-app; Remove-Item C:\\Atlas-app.tar"

if [ -f web/public/atlas.apk ]; then
  step "Envoi de l'app Android"
  scp -q web/public/atlas.apk "$TARGET:$DATA/app/atlas.apk"
fi

step "Construction et démarrage d'Atlas (Docker) — quelques minutes la première fois"
# En SSH, Windows n'ouvre pas le gestionnaire d'identifiants dont Docker Desktop a besoin : on lance la
# construction dans la session Windows ouverte, via une tâche planifiée, et on suit son journal.
remote "schtasks /Create /TN AtlasDeploy /TR 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Atlas-app\\scripts\\tower-up.ps1 -Data $DATA' /SC ONCE /ST 00:00 /IT /F | Out-Null; Remove-Item -ErrorAction SilentlyContinue C:\\Atlas-app\\deploy.log; schtasks /Run /TN AtlasDeploy | Out-Null"
for _ in $(seq 1 120); do
  sleep 10
  LOG="$(remote 'if (Test-Path C:\Atlas-app\deploy.log) { Get-Content C:\Atlas-app\deploy.log -Tail 3 }' 2>/dev/null || true)"
  printf '  %s\n' "$(printf '%s' "$LOG" | tail -1 | cut -c1-110)"
  if printf '%s' "$LOG" | grep -q '^EXIT'; then break; fi
done
printf '%s' "$LOG" | grep -q '^EXIT 0' || { echo "La construction a échoué :"; remote 'Get-Content C:\Atlas-app\deploy.log -Tail 30'; exit 1; }

step "Accès privé via Tailscale (HTTPS)"
remote "tailscale serve --bg 8420 | Out-Null; tailscale serve status"

step "Vérification"
remote 'Start-Sleep 5; (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8420/api/health).Content'
echo
echo "Atlas est en ligne. Sur le téléphone (Tailscale activé), ouvre l'adresse https://… affichée ci-dessus, puis /app."
