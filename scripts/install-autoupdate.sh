#!/usr/bin/env bash
# Active la mise à jour automatique de Waysake sur la tour Windows, depuis le Mac :
#   scripts/install-autoupdate.sh moi@tour C:/Atlas            active (ou met à jour) la tâche, puis la lance une fois
#   scripts/install-autoupdate.sh moi@tour C:/Atlas --status   état de la tâche et fin du journal
#   scripts/install-autoupdate.sh moi@tour C:/Atlas --off      désactive (supprime la tâche ; rien d'autre ne change)
# Toutes les 2 minutes, dans la session Windows ouverte (Docker Desktop n'a ses identifiants que là), la tour
# télécharge l'image publiée par la CI et la met en service si elle est nouvelle, avec sauvegarde de la base,
# vérification et retour arrière automatique (scripts/tower-autoupdate.ps1). Journal : <données>\update.log.
# Prérequis : un premier déploiement (scripts/release.sh) a créé C:\Atlas-app et son docker-compose.yml.
set -euo pipefail
TARGET="${1:?Usage : scripts/install-autoupdate.sh utilisateur@tour [C:/Atlas] [--status|--off]}"
DATA="${2:-C:/Atlas}"
MODE="${3:-on}"
case "$DATA" in --*) MODE="$DATA"; DATA="C:/Atlas" ;; esac
TASK=WaysakeAutoUpdate
cd "$(dirname "$0")/.."
remote() { ssh -o BatchMode=yes "$TARGET" "$1"; }
log_tail() { remote "if (Test-Path $DATA\\update.log) { Get-Content $DATA\\update.log -Tail $1 } else { '(journal vide : aucune mise à jour pour l''instant)' }"; }

case "$MODE" in
  --off)
    remote "schtasks /Delete /TN $TASK /F | Out-Null"
    echo "Mise à jour automatique désactivée. (Pour la réactiver : scripts/install-autoupdate.sh $TARGET $DATA)"
    exit 0 ;;
  --status)
    remote "\$t = Get-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue; if (\$t) { \$i = \$t | Get-ScheduledTaskInfo; 'Tâche : ' + \$t.State + ' ; dernier passage : ' + \$i.LastRunTime + ' (code ' + \$i.LastTaskResult + ')' } else { 'Tâche absente : mise à jour automatique désactivée.' }"
    log_tail 15
    exit 0 ;;
  on) ;;
  *) echo "Option inconnue : $MODE (--status ou --off)"; exit 1 ;;
esac

remote "if (-not (Test-Path C:\\Atlas-app\\docker-compose.yml)) { Write-Output 'C:\\Atlas-app\\docker-compose.yml manquant : lance d''abord scripts/release.sh.'; exit 1 }"
remote "New-Item -ItemType Directory -Force C:\\Atlas-app\\scripts | Out-Null"
for f in tower-lib.ps1 tower-autoupdate.ps1 tower-autoupdate.vbs; do
  scp -q "scripts/$f" "$TARGET:C:/Atlas-app/scripts/$f"
done
# /IT : seulement quand l'utilisateur est connecté (Docker Desktop tourne dans sa session). wscript lance
# PowerShell sans fenêtre : sinon une console clignoterait toutes les 2 minutes.
remote "schtasks /Create /TN $TASK /SC MINUTE /MO 2 /IT /F /TR 'wscript.exe //B //Nologo C:\\Atlas-app\\scripts\\tower-autoupdate.vbs $DATA' | Out-Null"
echo "Tâche $TASK installée (toutes les 2 minutes). Premier passage maintenant…"
remote "schtasks /Run /TN $TASK | Out-Null"
for _ in $(seq 1 40); do
  sleep 6
  STATE="$(remote "(Get-ScheduledTask -TaskName $TASK).State" 2> /dev/null | tr -d '\r' || true)"
  [ "$STATE" = Running ] || break
done
log_tail 6
echo
echo "Suivi : scripts/install-autoupdate.sh $TARGET $DATA --status   ·   désactiver : … --off"
