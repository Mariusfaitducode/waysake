#!/usr/bin/env bash
# Installe ou met à jour Waysake sur la tour Windows, depuis le Mac, en une commande :
#   scripts/deploy-tower.sh moi@tour            (nom Tailscale de la tour)
#   scripts/deploy-tower.sh moi@tour E:/Atlas   (autre dossier de données)
# Prérequis sur la tour : OpenSSH Server activé (voir README), Docker Desktop démarré, Tailscale connecté.
set -euo pipefail
# Les journaux de la tour sont en Windows-1252 : on les traite octet par octet (sinon tr échoue sur « é »,
# le script rate « EXIT 0 » et croit à un échec alors que la tour est à jour).
export LC_ALL=C
TARGET="${1:?Usage : scripts/deploy-tower.sh utilisateur@tour [D:/Atlas]}"
DATA="${2:-D:/Atlas}"
cd "$(dirname "$0")/.."
step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
remote() { ssh -o BatchMode=yes "$TARGET" "$1"; }

step "Connexion à la tour"
remote 'Write-Output "OK : $env:COMPUTERNAME"; docker version --format "Docker {{.Server.Version}}"; tailscale version | Select-Object -First 1'

COMMIT="$(git rev-parse --short HEAD)"
step "Version en ligne"
LIVE="$(remote '(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8420/api/health -TimeoutSec 5).Content' 2>/dev/null || true)"
echo "  tour : ${LIVE:-injoignable} ; à déployer : $COMMIT"
if [ "${FORCE:-0}" != 1 ] && grep -q "\"commit\":\"$COMMIT\"" <<< "$LIVE"; then
  echo "  La tour est déjà à jour. (FORCE=1 pour redéployer quand même.)"
  exit 0
fi

step "Envoi du code (version commitée : $COMMIT)"
ARCHIVE="$(mktemp -t atlas).tar"
# Seul le code commité part ; server/version.json dit à la tour (et à /api/health) quelle version elle fait tourner.
git archive --format=tar --add-virtual-file="server/version.json:{\"commit\":\"$COMMIT\",\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" HEAD > "$ARCHIVE"
scp -q "$ARCHIVE" "$TARGET:C:/Atlas-app.tar"
rm -f "$ARCHIVE"
remote "New-Item -ItemType Directory -Force C:\\Atlas-app, $DATA\\app | Out-Null; tar -xf C:\\Atlas-app.tar -C C:\\Atlas-app; Remove-Item C:\\Atlas-app.tar"

# La tour sert waysake.apk en priorité, sinon l'ancien atlas.apk déjà déposé.
if [ -f web/public/waysake.apk ]; then
  step "Envoi de l'app Android"
  scp -q web/public/waysake.apk "$TARGET:$DATA/app/waysake.apk"
fi

if [ -f web/public/waysake.shortcut ]; then
  step "Envoi du raccourci iPhone"
  scp -q web/public/waysake.shortcut "$TARGET:$DATA/app/waysake.shortcut"
fi

step "Construction et démarrage de Waysake (Docker) — quelques minutes la première fois"
# En SSH, Windows n'ouvre pas le gestionnaire d'identifiants dont Docker Desktop a besoin : on lance la
# construction dans la session Windows ouverte, via une tâche planifiée, et on suit son journal.
# tower-up.ps1 sauvegarde la base, construit, vérifie (santé Docker, aucun redémarrage, commit dans /api/health)
# et revient tout seul à la version précédente si ça ne va pas ; « EXIT 0 » = nouvelle version en ligne et vérifiée.
run_on_tower() { # run_on_tower <arguments de tower-up.ps1> ; renvoie 0 seulement si le journal finit par EXIT 0
  remote "schtasks /Create /TN AtlasDeploy /TR 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Atlas-app\\scripts\\tower-up.ps1 -Data $DATA $1' /SC ONCE /ST 00:00 /IT /F | Out-Null; Remove-Item -ErrorAction SilentlyContinue C:\\Atlas-app\\deploy.log; schtasks /Run /TN AtlasDeploy | Out-Null"
  local log="" state=""
  for _ in $(seq 1 90); do
    sleep 10
    log="$(remote 'if (Test-Path C:\Atlas-app\deploy.log) { Get-Content C:\Atlas-app\deploy.log -Tail 3 }' 2> /dev/null | tr -d '\r' || true)"
    printf '  %s\n' "$(printf '%s' "$log" | tail -1 | cut -c1-110)"
    if grep -q '^EXIT' <<< "$log"; then break; fi
    # La tâche s'est arrêtée sans écrire EXIT (tuée, session fermée…) : inutile d'attendre davantage.
    state="$(remote '(Get-ScheduledTask -TaskName AtlasDeploy).State' 2> /dev/null | tr -d '\r' || true)"
    if [ -n "$state" ] && [ "$state" != Running ]; then
      sleep 3
      log="$(remote 'Get-Content C:\Atlas-app\deploy.log -Tail 3' 2> /dev/null | tr -d '\r' || true)"
      grep -q '^EXIT' <<< "$log" || { echo "  La tâche AtlasDeploy s'est arrêtée (état : $state) sans terminer."; break; }
    fi
  done
  grep -q '^EXIT 0' <<< "$log"
}

# Secours si tower-up.ps1 n'a pas pu revenir en arrière lui-même (tâche interrompue, vérification ci-dessous ratée).
rollback() {
  echo "$1"
  remote 'schtasks /End /TN AtlasDeploy 2>$null | Out-Null' || true
  step "Retour à la version précédente"
  if run_on_tower -Rollback; then echo "  Version précédente rétablie : $(remote "(Invoke-WebRequest -UseBasicParsing $HEALTH_URL -TimeoutSec 5).Content" 2> /dev/null || echo '?')"
  else echo "  Le retour arrière a échoué : la tour est peut-être hors ligne. Journal :"; remote 'Get-Content C:\Atlas-app\deploy.log -Tail 30' || true
  fi
  exit 1
}
HEALTH_URL=http://127.0.0.1:8420/api/health

if ! run_on_tower "-Commit $COMMIT"; then
  echo "Le déploiement a échoué :"
  remote 'Get-Content C:\Atlas-app\deploy.log -Tail 40' || true
  # tower-up.ps1 a fait le retour arrière s'il est allé jusqu'au bout (EXIT 1) ; sinon, on le fait d'ici.
  FINISHED="$(remote 'Select-String -Quiet -Pattern "^EXIT" C:\Atlas-app\deploy.log' 2> /dev/null | tr -d '\r' || true)"
  [ "$FINISHED" = True ] || rollback "Déploiement interrompu avant sa fin."
  exit 1
fi

step "Accès privé via Tailscale (HTTPS)"
remote "tailscale serve --bg 8420 | Out-Null; tailscale serve status"

step "Vérification"
# Contrôle indépendant de celui de la tour : le bon commit en ligne, et un conteneur sain qui ne redémarre pas.
sleep 10
HEALTH="$(remote "(Invoke-WebRequest -UseBasicParsing $HEALTH_URL -TimeoutSec 5).Content" 2> /dev/null || true)"
CONTAINER="$(remote "docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.RestartCount}}' atlas" 2> /dev/null | tr -d '\r' || true)"
echo "  /api/health : ${HEALTH:-injoignable}"
echo "  conteneur   : ${CONTAINER:-introuvable} (état, santé, redémarrages)"
grep -q "\"commit\":\"$COMMIT\"" <<< "$HEALTH" || rollback "La tour ne répond pas avec la version $COMMIT."
[ "$CONTAINER" = "running healthy 0" ] || rollback "Le conteneur n'est pas sain (attendu : running healthy 0)."
echo
echo "Waysake est en ligne. Sur le téléphone (Tailscale activé), ouvre l'adresse https://… affichée ci-dessus, puis /app."
