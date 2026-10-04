# Fonctions communes aux scripts de la tour Windows (tower-up.ps1, tower-autoupdate.ps1).
# Windows PowerShell 5.1 : pas de « && », pas de « ?? ». Fichier en UTF-8 avec BOM (sinon les accents sont abîmés).
#
# Toutes les commandes docker passent par Invoke-Native : sous PowerShell, une ligne écrite par docker sur
# stderr (même un simple message de progression) devient une erreur « NativeCommandError », qui arrête le
# script si $ErrorActionPreference vaut Stop. Ici on récupère le texte et le code de sortie, et on décide.

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Les variables d'environnement WAYSAKE_TEST_* ne servent qu'aux tests (sur une autre machine que la tour).
$WaysakeImage = "ghcr.io/mariusfaitducode/waysake:latest"
if ($env:WAYSAKE_TEST_IMAGE) { $WaysakeImage = $env:WAYSAKE_TEST_IMAGE }
$WaysakePrevious = "waysake:previous"
$WaysakeContainer = "atlas"
if ($env:WAYSAKE_TEST_CONTAINER) { $WaysakeContainer = $env:WAYSAKE_TEST_CONTAINER }
$WaysakeApp = "C:\Atlas-app"  # dossier du docker-compose.yml
if ($env:WAYSAKE_TEST_APP_DIR) { $WaysakeApp = $env:WAYSAKE_TEST_APP_DIR }
$WaysakeHealthUrl = "http://127.0.0.1:8420/api/health"
if ($env:WAYSAKE_TEST_HEALTH_URL) { $WaysakeHealthUrl = $env:WAYSAKE_TEST_HEALTH_URL }
$WaysakeLog = $null  # fichier du journal, choisi par le script appelant

function Write-UpdateLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  if ($WaysakeLog) { $line | Out-File $WaysakeLog -Append -Encoding utf8 }
}

function Invoke-Native([string]$Exe, [string[]]$Arguments) {
  $eap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
  } catch {
    $out = "$_"
    $code = 1
  } finally {
    $ErrorActionPreference = $eap
  }
  [pscustomobject]@{ Code = $code; Out = (@($out) -join "`n").Trim() }
}

function Invoke-Docker([string[]]$Arguments) { Invoke-Native "docker" $Arguments }

function Get-LastLine([string]$Text) {
  $lines = @($Text -split "`n" | Where-Object { $_.Trim() })
  if ($lines.Count -eq 0) { return "" }
  $lines[-1].Trim()
}

# Identifiant (sha256:…) d'une image locale, ou "" si elle n'existe pas.
function Get-ImageId([string]$Ref) {
  $r = Invoke-Docker @("image", "inspect", "--format", "{{.Id}}", $Ref)
  if ($r.Code -ne 0) { return "" }
  Get-LastLine $r.Out
}

# Commit inscrit par la CI dans l'image (étiquette org.opencontainers.image.revision), en version courte.
function Get-ImageCommit([string]$Ref) {
  $r = Invoke-Docker @("image", "inspect", "--format", "{{json .Config.Labels}}", $Ref)
  if ($r.Code -ne 0) { return "" }
  try { $labels = (Get-LastLine $r.Out) | ConvertFrom-Json } catch { return "" }
  if (-not $labels) { return "" }
  $rev = [string]$labels.'org.opencontainers.image.revision'
  if ($rev.Length -gt 7) { $rev = $rev.Substring(0, 7) }
  $rev
}

# État du conteneur : Exists, Status (running, restarting, exited…), Health (healthy, starting, unhealthy, ""),
# Restarts (redémarrages depuis sa création), Image (identifiant de l'image qu'il exécute).
function Get-ContainerInfo {
  $r = Invoke-Docker @("container", "inspect", "--format", "{{.Image}}|{{.RestartCount}}|{{json .State}}", $WaysakeContainer)
  $info = [pscustomobject]@{ Exists = $false; Status = "absent"; Health = ""; Restarts = 0; Image = "" }
  if ($r.Code -ne 0) { return $info }
  $parts = (Get-LastLine $r.Out).Split("|", 3)
  if ($parts.Count -lt 3) { return $info }
  try { $state = $parts[2] | ConvertFrom-Json } catch { return $info }
  $info.Exists = $true
  $info.Image = $parts[0]
  $info.Restarts = [int]$parts[1]
  $info.Status = [string]$state.Status
  if ($state.Health) { $info.Health = [string]$state.Health.Status }
  $info
}

# Réponse de /api/health ({ ok, version }) ou $null si Waysake ne répond pas.
function Get-Health {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $WaysakeHealthUrl
    return ($res.Content | ConvertFrom-Json)
  } catch {
    return $null
  }
}

# Version lisible pour le journal : commit (et date), « dev » sans version, « injoignable » sans réponse.
function Get-LiveVersion {
  $h = Get-Health
  if (-not $h -or -not $h.ok) { return "injoignable" }
  if ($h.version -and $h.version.commit) { return [string]$h.version.commit }
  "dev"
}

# Démarre (ou recrée) le conteneur avec l'image déjà présente sous $WaysakeImage, sans construire ni télécharger.
function Start-Waysake([string]$Data) {
  $env:WAYSAKE_DATA = $Data
  $env:ATLAS_DATA = $Data  # ancien nom, encore lu par docker-compose.yml
  Push-Location $WaysakeApp
  try {
    Invoke-Docker @("compose", "up", "-d", "--no-build", "--pull", "never", "--force-recreate")
  } finally {
    Pop-Location
  }
}

# Attend que le conteneur exécute $ExpectImage, soit « healthy » sans avoir redémarré, et que /api/health réponde
# ok (avec le commit $ExpectCommit s'il est connu et que l'image annonce sa version).
# Renvoie "" si tout va bien, sinon la raison de l'échec.
function Wait-Healthy([string]$ExpectImage, [string]$ExpectCommit, [int]$TimeoutSec = 150) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $last = ""
  while ((Get-Date) -lt $deadline) {
    $c = Get-ContainerInfo
    if (-not $c.Exists) { $last = "le conteneur $WaysakeContainer n'existe pas" }
    elseif ($ExpectImage -and $c.Image -ne $ExpectImage) { return "le conteneur n'a pas été remplacé (il exécute encore l'image $($c.Image))" }
    elseif ($c.Restarts -gt 0) { return "le conteneur redémarre en boucle ($($c.Restarts) redémarrage(s), état $($c.Status))" }
    elseif ($c.Status -eq "exited" -or $c.Status -eq "dead") { return "le conteneur s'est arrêté (état $($c.Status))" }
    elseif ($c.Health -eq "unhealthy") { return "Docker juge le conteneur en mauvaise santé" }
    elseif ($c.Health -eq "healthy") {
      $h = Get-Health
      if ($h -and $h.ok) {
        $commit = ""
        if ($h.version -and $h.version.commit) { $commit = [string]$h.version.commit }
        if (-not $ExpectCommit -or -not $commit -or $commit.StartsWith($ExpectCommit) -or $ExpectCommit.StartsWith($commit)) { return "" }
        return "/api/health annonce le commit $commit au lieu de $ExpectCommit"
      }
      $last = "/api/health ne répond pas"
    } else { $last = "état $($c.Status), santé « $($c.Health) »" }
    Start-Sleep -Seconds 5
  }
  "pas prêt après $TimeoutSec s ($last)"
}

# Dernières lignes du journal du conteneur, pour comprendre un échec.
function Get-ContainerLogs([int]$Tail = 40) {
  (Invoke-Docker @("logs", "--tail", "$Tail", $WaysakeContainer)).Out
}

# Instantané cohérent de la base avant une mise à jour, dans <données>\backups\avant-maj-<date>.*
# Si Waysake tourne : API de sauvegarde de SQLite (comme l'instantané quotidien, server/backup.ts), exécutée dans
# le conteneur en cours, donc valable même si la base est en plein travail. Sinon : copie des fichiers
# atlas.sqlite, -wal et -shm (personne n'écrit dedans). Garde les $Keep dernières sauvegardes « avant-maj ».
# Renvoie le nom de la sauvegarde, "aucune base" pour une installation neuve, ou lève une erreur.
function Save-DatabaseSnapshot([string]$Data, [int]$Keep = 10) {
  $db = Join-Path $Data "atlas.sqlite"
  if (-not (Test-Path $db)) { return "aucune base" }
  $dir = Join-Path $Data "backups"
  New-Item -ItemType Directory -Force $dir | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $name = "avant-maj-$stamp.db"
  $c = Get-ContainerInfo
  $done = $false
  if ($c.Status -eq "running") {
    # Pas de guillemets doubles dans ce code : PowerShell 5.1 les retire des arguments passés à docker.
    $js = "const D=require('better-sqlite3');const d=new D('/data/atlas.sqlite',{fileMustExist:true});" +
      "d.backup('/data/backups/$name').then(()=>{d.close();process.exit(0)},e=>{console.error(e.message);process.exit(1)})"
    $r = Invoke-Docker @("exec", $WaysakeContainer, "node", "-e", $js)
    $done = ($r.Code -eq 0) -and (Test-Path (Join-Path $dir $name))
  }
  if (-not $done) {
    if ($c.Status -eq "running") { throw "instantané SQLite impossible : $(Get-LastLine $r.Out)" }
    $name = "avant-maj-$stamp.sqlite"
    foreach ($suffix in @("", "-wal", "-shm")) {
      if (Test-Path "$db$suffix") { Copy-Item "$db$suffix" (Join-Path $dir "$name$suffix") -ErrorAction Stop }
    }
  }
  # Une sauvegarde = un horodatage (1 fichier .db, ou .sqlite + -wal + -shm) ; on garde les $Keep plus récentes.
  $stamps = @(Get-ChildItem $dir -Filter "avant-maj-*" | ForEach-Object { [regex]::Match($_.Name, '^avant-maj-(\d{8}-\d{6})\.').Groups[1].Value } |
      Where-Object { $_ } | Sort-Object -Unique -Descending)
  if ($stamps.Count -gt $Keep) {
    foreach ($old in $stamps[$Keep..($stamps.Count - 1)]) {
      Get-ChildItem $dir -Filter "avant-maj-$old.*" | Remove-Item -Force -ErrorAction SilentlyContinue
    }
  }
  $name
}

# Remet l'image waysake:previous en service et vérifie qu'elle répond. Renvoie "" si c'est le cas, sinon la raison.
function Restore-Previous([string]$Data) {
  $prev = Get-ImageId $WaysakePrevious
  if (-not $prev) { return "aucune image waysake:previous" }
  $r = Invoke-Docker @("tag", $WaysakePrevious, $WaysakeImage)
  if ($r.Code -ne 0) { return "docker tag : $(Get-LastLine $r.Out)" }
  $r = Start-Waysake $Data
  if ($r.Code -ne 0) { return "docker compose : $(Get-LastLine $r.Out)" }
  Wait-Healthy $prev "" 150
}

# Verrou partagé par tous les déploiements de la tour (manuels et automatiques). Un mutex Windows nommé est
# libéré par le système si le processus meurt : pas de verrou orphelin. Renvoie le verrou ou $null.
function Enter-DeployLock([int]$WaitMs) {
  $m = New-Object System.Threading.Mutex($false, "Global\WaysakeTowerDeploy")
  $ok = $false
  try { $ok = $m.WaitOne($WaitMs) } catch { $ok = $true }  # AbandonedMutexException : l'ancien détenteur est mort
  if ($ok) { return $m }
  $m.Dispose()
  $null
}

function Exit-DeployLock($Lock) {
  if ($Lock) {
    try { $Lock.ReleaseMutex() } catch { }
    $Lock.Dispose()
  }
}
