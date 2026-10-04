# Mise à jour automatique de Waysake sur la tour : lancé toutes les 2 minutes par la tâche planifiée
# « WaysakeAutoUpdate » (installée par scripts/install-autoupdate.sh), dans la session Windows ouverte
# (Docker Desktop n'a ses identifiants que là). L'image ne sort de la CI que testée (voir .github/workflows/ci.yml).
#
# À chaque passage : télécharge ghcr.io/mariusfaitducode/waysake:latest. Rien d'autre ne se passe (et rien n'est
# écrit) si c'est l'image déjà en service, ou une image déjà traitée. Sinon :
#   1. instantané de la base dans <données>\backups\avant-maj-<date>.* (les -Keep derniers sont gardés) ;
#   2. l'image en service est étiquetée waysake:previous, puis le conteneur est recréé avec la nouvelle ;
#   3. jusqu'à -Timeout secondes pour que /api/health réponde ok avec le nouveau commit et que le conteneur
#      soit « healthy » sans avoir redémarré ; sinon retour arrière automatique vers waysake:previous.
# Journal : <données>\update.log (une ligne par événement). État : <données>\autoupdate-state.json.
# Une image refusée n'est pas retentée : la suivante publiée le sera. Pour la retenter, supprimer le fichier d'état.
param(
  [string]$Data = "C:/Atlas",
  [int]$Keep = 10,
  [int]$Timeout = 150
)
. (Join-Path $PSScriptRoot "tower-lib.ps1")
$WaysakeLog = Join-Path $Data "update.log"
$stateFile = Join-Path $Data "autoupdate-state.json"

function Read-State {
  $s = $null
  if (Test-Path $stateFile) { try { $s = Get-Content $stateFile -Raw | ConvertFrom-Json } catch { $s = $null } }
  $state = [pscustomobject]@{ seen = ""; pullFailing = $false; pending = "" }
  if ($s) { foreach ($k in @("seen", "pullFailing", "pending")) { if ($null -ne $s.$k) { $state.$k = $s.$k } } }
  $state
}
function Save-State($State) { $State | ConvertTo-Json | Out-File $stateFile -Encoding utf8 }

# Échec : journal du conteneur fautif dans update-failed.log, puis retour arrière.
function Undo-Update([string]$Reason, [string]$NewCommit, [string]$Before) {
  Write-UpdateLog "ÉCHEC de $NewCommit : $Reason. Retour arrière vers $Before (détails : update-failed.log)"
  "$(Get-Date -Format s) $NewCommit : $Reason`n$(Get-ContainerLogs 60)" | Out-File (Join-Path $Data "update-failed.log") -Encoding utf8
  $err = Restore-Previous $Data
  if ($err) { Write-UpdateLog "RETOUR ARRIÈRE ÉCHOUÉ : $err. Waysake est peut-être hors ligne : voir docker ps sur la tour." }
  else { Write-UpdateLog "Retour arrière réussi : $(Get-LiveVersion) en ligne" }
}

$lock = Enter-DeployLock 0
if (-not $lock) { exit 0 }  # une autre mise à jour (automatique ou manuelle) est en cours
try {
  $state = Read-State

  # Un passage précédent a été interrompu (tour éteinte, session fermée…) en pleine mise à jour : on vérifie.
  if ($state.pending) {
    if ((Get-ContainerInfo).Image -ne $state.pending) {
      Write-UpdateLog "Mise à jour interrompue avant le remplacement du conteneur : $(Get-LiveVersion) toujours en ligne"
    } else {
      $err = Wait-Healthy $state.pending "" 60
      if ($err) { Undo-Update "mise à jour interrompue, puis $err" "(interrompue)" "l'image précédente" }
      else { Write-UpdateLog "Mise à jour interrompue vérifiée : $(Get-LiveVersion) en ligne et en bonne santé" }
    }
    $state.pending = ""
    Save-State $state
  }

  $pull = Invoke-Docker @("pull", "--quiet", $WaysakeImage)
  if ($pull.Code -ne 0) {
    # Réseau ou Docker Desktop indisponible : noté une fois, pas toutes les 2 minutes.
    if (-not $state.pullFailing) {
      Write-UpdateLog "Téléchargement de l'image impossible (réessai toutes les 2 min) : $(Get-LastLine $pull.Out)"
      $state.pullFailing = $true
      Save-State $state
    }
    exit 0
  }
  if ($state.pullFailing) {
    Write-UpdateLog "Téléchargement de l'image rétabli"
    $state.pullFailing = $false
    Save-State $state
  }

  $new = Get-ImageId $WaysakeImage
  $current = Get-ContainerInfo
  if (-not $new -or $new -eq $state.seen -or ($current.Exists -and $current.Image -eq $new)) {
    if ($new -and $new -ne $state.seen) { $state.seen = $new; Save-State $state }
    exit 0  # rien de nouveau
  }

  $newCommit = Get-ImageCommit $WaysakeImage
  if (-not $newCommit) { $newCommit = $new.Substring(7, 12) }
  $before = Get-LiveVersion
  Write-UpdateLog "Nouvelle image $newCommit (en ligne : $before) : mise à jour"
  $state.seen = $new  # traitée, quelle que soit l'issue : une image refusée n'est pas retentée en boucle
  Save-State $state

  try { $snapshot = Save-DatabaseSnapshot $Data $Keep }
  catch {
    Write-UpdateLog "Sauvegarde de la base impossible ($($_.Exception.Message)) : mise à jour annulée"
    exit 1
  }
  Write-UpdateLog "Base sauvegardée : $snapshot"

  if ($current.Exists) {
    $r = Invoke-Docker @("tag", $current.Image, $WaysakePrevious)
    if ($r.Code -ne 0) {
      Write-UpdateLog "Impossible d'étiqueter l'image en service ($(Get-LastLine $r.Out)) : mise à jour annulée"
      exit 1
    }
  }
  $state.pending = $new
  Save-State $state

  $r = Start-Waysake $Data
  $err = ""
  if ($r.Code -ne 0) { $err = "docker compose : $(Get-LastLine $r.Out)" }
  else { $err = Wait-Healthy $new $newCommit $Timeout }

  if (-not $err) {
    Write-UpdateLog "OK : $before -> $(Get-LiveVersion) en ligne et en bonne santé"
  } elseif ($current.Exists) {
    Undo-Update $err $newCommit $before
  } else {
    Write-UpdateLog "ÉCHEC de $newCommit : $err (pas d'image précédente : aucun retour arrière possible)"
  }
  $state.pending = ""
  Save-State $state
} finally {
  Exit-DeployLock $lock
}
