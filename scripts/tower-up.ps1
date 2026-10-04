# Démarre / met à jour Atlas sur la tour. Lancé par scripts/deploy-tower.sh via une tâche planifiée,
# pour s'exécuter dans la session Windows ouverte (Docker Desktop y a accès aux identifiants).
param([string]$Data = "C:/Atlas")
$log = "C:\Atlas-app\deploy.log"
"$(Get-Date -Format s) Démarrage (données : $Data)" | Out-File $log -Encoding utf8
Set-Location C:\Atlas-app
$env:ATLAS_DATA = $Data
docker compose up -d --build *>> $log
"EXIT $LASTEXITCODE" | Out-File $log -Append -Encoding utf8
