# Déploiement manuel de Waysake sur la tour : construit l'image depuis C:\Atlas-app et la met en service.
# Lancé par scripts/deploy-tower.sh via une tâche planifiée, pour s'exécuter dans la session Windows ouverte
# (Docker Desktop y a accès aux identifiants).
#   -Commit abc1234 : commit attendu dans /api/health après le déploiement
#   -Rollback       : remet seulement en service l'image waysake:previous (secours de deploy-tower.sh)
# Comme la mise à jour automatique : sauvegarde de la base, vérification (santé Docker sans redémarrage,
# /api/health avec le bon commit), retour arrière automatique en cas d'échec. Une ligne finale « EXIT 0 »
# dans deploy.log signifie : la nouvelle version est en ligne et vérifiée ; « EXIT 1 » : elle ne l'est pas.
param(
  [string]$Data = "C:/Atlas",
  [string]$Commit = "",
  [switch]$Rollback
)
. (Join-Path $PSScriptRoot "tower-lib.ps1")
$WaysakeLog = Join-Path $Data "update.log"
$log = Join-Path $WaysakeApp "deploy.log"
function Say([string]$Message) { "$(Get-Date -Format s) $Message" | Out-File $log -Append -Encoding utf8 }
function Finish([int]$Code) { "EXIT $Code" | Out-File $log -Append -Encoding utf8; exit $Code }

"$(Get-Date -Format s) Démarrage (données : $Data)" | Out-File $log -Encoding utf8
$lock = Enter-DeployLock 600000
if (-not $lock) { Say "Une autre mise à jour est en cours depuis plus de 10 minutes : abandon."; Finish 1 }
try {
  if ($Rollback) {
    Write-UpdateLog "Déploiement manuel : retour arrière demandé (en ligne : $(Get-LiveVersion))"
    $err = Restore-Previous $Data
    if ($err) { Say "Retour arrière échoué : $err"; Write-UpdateLog "RETOUR ARRIÈRE ÉCHOUÉ : $err"; Finish 1 }
    Say "Retour arrière réussi : $(Get-LiveVersion) en ligne"
    Write-UpdateLog "Retour arrière réussi : $(Get-LiveVersion) en ligne"
    Finish 0
  }

  $before = Get-LiveVersion
  $current = Get-ContainerInfo
  Write-UpdateLog "Déploiement manuel de $Commit (en ligne : $before)"
  try { $snapshot = Save-DatabaseSnapshot $Data }
  catch { Say "Sauvegarde de la base impossible : $($_.Exception.Message)"; Write-UpdateLog "Déploiement annulé : sauvegarde impossible"; Finish 1 }
  Say "Base sauvegardée : $snapshot"
  if ($current.Exists) { Invoke-Docker @("tag", $current.Image, $WaysakePrevious) | Out-Null }

  Set-Location $WaysakeApp
  $env:WAYSAKE_DATA = $Data
  $env:ATLAS_DATA = $Data  # ancien nom, encore lu par docker-compose.yml
  # Sortie de docker en texte dans le journal (sans que stderr devienne une erreur PowerShell).
  & docker compose up -d --build 2>&1 | ForEach-Object { "$_" } | Out-File $log -Append -Encoding utf8
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Say "docker compose a échoué (code $code) ; en ligne : $(Get-LiveVersion)"
    Write-UpdateLog "ÉCHEC du déploiement manuel de $Commit : docker compose (code $code) ; en ligne : $(Get-LiveVersion)"
    Finish 1
  }

  Say "Vérification de la nouvelle version…"
  $err = Wait-Healthy (Get-ImageId $WaysakeImage) $Commit 150
  if (-not $err) {
    Say "En ligne et en bonne santé : $(Get-LiveVersion)"
    Write-UpdateLog "OK (manuel) : $before -> $(Get-LiveVersion) en ligne et en bonne santé"
    Finish 0
  }
  Say "ÉCHEC : $err"
  Get-ContainerLogs 40 | Out-File $log -Append -Encoding utf8
  Write-UpdateLog "ÉCHEC du déploiement manuel de $Commit : $err. Retour arrière vers $before"
  if (-not $current.Exists) { Say "Pas de version précédente : aucun retour arrière possible."; Finish 1 }
  Say "Retour arrière vers $before…"
  $err = Restore-Previous $Data
  if ($err) { Say "RETOUR ARRIÈRE ÉCHOUÉ : $err"; Write-UpdateLog "RETOUR ARRIÈRE ÉCHOUÉ : $err" }
  else { Say "Retour arrière réussi : $(Get-LiveVersion) en ligne"; Write-UpdateLog "Retour arrière réussi : $(Get-LiveVersion) en ligne" }
  Finish 1
} finally {
  Exit-DeployLock $lock
}
