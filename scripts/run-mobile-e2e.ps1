param(
  [string]$ClientProject = 'C:\Users\ThinkPad\Desktop\Barmej',
  [string]$ProProject = 'C:\Users\ThinkPad\Desktop\BarmejPro',
  [string]$ApiUrl = 'http://127.0.0.1:8091'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command maestro -ErrorAction SilentlyContinue)) {
  throw 'Maestro CLI est absent. Installez Maestro, puis rouvrez le terminal.'
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw 'ADB est absent du PATH. Ajoutez Android SDK platform-tools au PATH.'
}

$devices = adb devices
if (-not ($devices -match '\tdevice$')) {
  throw 'Aucun téléphone ou émulateur Android autorisé n’est connecté.'
}

try {
  Invoke-RestMethod -Uri "$ApiUrl/health" -TimeoutSec 5 | Out-Null
} catch {
  throw "Le backend local ne répond pas sur $ApiUrl. Démarrez-le avant la recette."
}

Write-Host '1/2 · Recette Barmej client'
maestro test "$ClientProject\.maestro\flows"
if ($LASTEXITCODE -ne 0) { throw 'La recette Barmej client a échoué.' }

Write-Host '2/2 · Recette Barmej Pro'
maestro test "$ProProject\.maestro\flows"
if ($LASTEXITCODE -ne 0) { throw 'La recette Barmej Pro a échoué.' }

Write-Host 'Recette mobile complète réussie.'
