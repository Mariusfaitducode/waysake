#!/usr/bin/env bash
# Programme la sauvegarde nocturne d'Atlas sur un autre disque de la tour, depuis le Mac :
#   scripts/install-backup.sh moi@tour E:/            (disque externe E:)
#   scripts/install-backup.sh moi@tour E:/ C:/Atlas   (dossier de données, C:/Atlas par défaut)
# Chaque nuit à 3 h 30, la tour copie ses photos et l'instantané du jour de la base dans E:\Atlas.
# Tourne même sans session ouverte (compte SYSTEM). Journal : <données>\backup.log.
set -euo pipefail
TARGET="${1:?Usage : scripts/install-backup.sh utilisateur@tour E:/ [C:/Atlas]}"
DEST="${2:?Indique le disque de sauvegarde, ex. E:/}"
DATA="${3:-C:/Atlas}"
cd "$(dirname "$0")/.."
remote() { ssh -o BatchMode=yes "$TARGET" "$1"; }

scp -q scripts/backup-tower.ps1 "$TARGET:C:/Atlas-app/scripts/backup-tower.ps1"
remote "schtasks /Create /TN AtlasBackup /RU SYSTEM /SC DAILY /ST 03:30 /RL HIGHEST /F /TR 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Atlas-app\\scripts\\backup-tower.ps1 -Data $DATA -Target $DEST' | Out-Null"
echo "Première sauvegarde maintenant…"
remote "schtasks /Run /TN AtlasBackup | Out-Null; Start-Sleep 20; Get-Content $DATA\\backup.log -Tail 1"
