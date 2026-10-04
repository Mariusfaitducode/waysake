# Sauvegarde Waysake sur un autre disque (lancé chaque nuit par la tâche planifiée « AtlasBackup »,
# installée par scripts/install-backup.sh). Copie les nouveaux originaux, les miniatures et les
# instantanés quotidiens de la base (DATA_DIR\backups) ; ne supprime jamais rien sur la sauvegarde.
# La base vivante (atlas.sqlite*) n'est pas copiée : elle change pendant la copie, l'instantané du jour la remplace.
param(
  [string]$Data = "C:\Atlas",
  [Parameter(Mandatory = $true)][string]$Target
)
$log = Join-Path $Data "backup.log"
if (-not (Test-Path $Target)) {
  "$(Get-Date -Format s) Disque de sauvegarde absent : $Target" | Out-File $log -Append -Encoding utf8
  exit 2
}
$dest = Join-Path $Target "Atlas"  # dossier de sauvegarde existant : nom gardé
robocopy $Data $dest /E /XO /R:2 /W:5 /NP /NFL /NDL /XD (Join-Path $Data "tmp") /XF atlas.sqlite atlas.sqlite-wal atlas.sqlite-shm backup.log deploy.log | Out-Null
# robocopy : 0 à 7 = réussite (8 et plus = échec).
$code = $LASTEXITCODE
$state = if ($code -lt 8) { "OK" } else { "ÉCHEC" }
"$(Get-Date -Format s) $state (robocopy $code) → $dest" | Out-File $log -Append -Encoding utf8
if ($code -ge 8) { exit 1 } else { exit 0 }
