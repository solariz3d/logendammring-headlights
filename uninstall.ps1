# uninstall.ps1 - undo the Logendammring headlight fix: put both backups back and check them.
#
#     powershell -ExecutionPolicy Bypass -File uninstall.ps1       (or -TrackPath "<...\content\tracks\Loegendammring>")
#
#   Loegendammring.kn5.original            -> Loegendammring.kn5            (checked: the original track file)
#   extension\ext_config.ini.before-headlights -> extension\ext_config.ini  (checked: byte-identical to the backup)
# Each backup is verified BEFORE it is moved back and the restored file is verified AFTER, so the track folder ends
# exactly as it was before install.ps1 ran. Refuses while Assetto Corsa (acs.exe) is running.
# Plain ASCII on purpose, like install.ps1 (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
[CmdletBinding()]
param([string]$TrackPath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$o = [string][char]0x00F6
$TRACKNAME = "L${o}gendammring"
$HASH_ORIGINAL_KN5 = 'e472ba4b44d5a3bc139321a266e83bec69a181f731651c9af59b626752903ef9'
$HASH_NEW_CONFIG = '05b9fb19a3510d3d56f244207c5e1e62b9768f45e0610342e2a2c52dd5cd8be9'

function Stop-With([string]$msg) { Write-Host ""; Write-Host "NOT UNINSTALLED: $msg" -ForegroundColor Red; exit 1 }
function Hash([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }

if (-not $TrackPath) {
  # the same Steam search as install.ps1, kept inline so this file stands alone
  $roots = @()
  foreach ($k in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    try { $item = Get-ItemProperty -LiteralPath $k -ErrorAction Stop; foreach ($n in 'SteamPath', 'InstallPath') { if ($item.PSObject.Properties[$n]) { $roots += ($item.$n -replace '/', '\') } } } catch { }
  }
  $libs = @()
  foreach ($r in ($roots | Select-Object -Unique)) {
    $libs += $r
    $vdf = Join-Path $r 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) { foreach ($m in [regex]::Matches([System.IO.File]::ReadAllText($vdf), '"path"\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value -replace '\\\\', '\') } }
  }
  foreach ($l in ($libs | Select-Object -Unique)) {
    $t = Join-Path $l "steamapps\common\assettocorsa\content\tracks\$TRACKNAME"
    if (Test-Path -LiteralPath $t) { $TrackPath = $t; break }
  }
  if (-not $TrackPath) { Stop-With "the track folder $TRACKNAME was not found in any Steam library. Run again with -TrackPath." }
}
if (-not (Test-Path -LiteralPath $TrackPath)) { Stop-With "the track folder was not found: $TrackPath" }
Write-Host "Track folder: $TrackPath"
if (Get-Process -Name 'acs' -ErrorAction SilentlyContinue) { Stop-With "Assetto Corsa is running (acs.exe). Close it and run this again." }

$liveKn5 = Join-Path $TrackPath "$TRACKNAME.kn5"
$bakKn5 = Join-Path $TrackPath "$TRACKNAME.kn5.original"
$liveIni = Join-Path $TrackPath 'extension\ext_config.ini'
$bakIni = Join-Path $TrackPath 'extension\ext_config.ini.before-headlights'

if (-not (Test-Path -LiteralPath $bakKn5)) { Stop-With "there is no $TRACKNAME.kn5.original backup here, so there is nothing to restore." }
if ((Hash $bakKn5) -ne $HASH_ORIGINAL_KN5) { Stop-With "$TRACKNAME.kn5.original is not the original track file (sha256 mismatch). Not touching anything." }

$iniWant = $null
if (Test-Path -LiteralPath $bakIni) { $iniWant = Hash $bakIni }
elseif ((Test-Path -LiteralPath $liveIni) -and (Hash $liveIni) -ne $HASH_NEW_CONFIG) { Stop-With "ext_config.ini has no backup and is not the fix's file: leaving it alone." }

Move-Item -LiteralPath $bakKn5 -Destination $liveKn5 -Force
if ($iniWant) { Move-Item -LiteralPath $bakIni -Destination $liveIni -Force }
elseif (Test-Path -LiteralPath $liveIni) { Remove-Item -LiteralPath $liveIni } # the track had no config before install

$ok = (Hash $liveKn5) -eq $HASH_ORIGINAL_KN5
Write-Host ("  {0,-8} {1}" -f $(if ($ok) { 'ok' } else { 'MISMATCH' }), "$TRACKNAME.kn5 is the original")
if ($iniWant) { $iniOk = (Hash $liveIni) -eq $iniWant; if (-not $iniOk) { $ok = $false }; Write-Host ("  {0,-8} {1}" -f $(if ($iniOk) { 'ok' } else { 'MISMATCH' }), 'ext_config.ini is the backed-up one') }
if (-not $ok) { Stop-With "a restored file did not verify." }
Write-Host ""
Write-Host "UNINSTALLED. The track is back to how it was before the fix." -ForegroundColor Green
