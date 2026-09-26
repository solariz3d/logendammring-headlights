# install.ps1 - install the Logendammring headlight fix without Content Manager.
#
#   Put this script next to Loegendammring-headlights.zip (or next to the unzipped "Loegendammring" folder) and run:
#     powershell -ExecutionPolicy Bypass -File install.ps1
#   Optional: -TrackPath "<...\content\tracks\Loegendammring>" to skip the Steam search; -FindOnly to only report
#   where the track is and change nothing.
#
# What it does, in order, and it stops at the first thing that is not right:
#   1. finds assettocorsa through Steam's libraryfolders.vdf, across every Steam library;
#   2. refuses while Assetto Corsa (acs.exe) is running;
#   3. refuses unless the installed track file is the exact version this fix was made for (or already has the fix);
#   4. backs up Loegendammring.kn5 as Loegendammring.kn5.original and extension\ext_config.ini as
#      ext_config.ini.before-headlights, never overwriting a backup that already exists;
#   5. copies the two new files in, then checks the sha256 of every file it touched.
# Undo: uninstall.ps1 (it puts both backups back and checks them).
#
# This file is plain ASCII on purpose: Windows PowerShell 5.1 reads a script without a BOM as ANSI, so the track's
# "o with umlaut" is built from its code point instead of being typed, and every path is used with -LiteralPath.
[CmdletBinding()]
param([string]$TrackPath, [string]$Source, [switch]$FindOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$o = [string][char]0x00F6
$TRACKNAME = "L${o}gendammring"
$HASH_ORIGINAL_KN5 = 'e472ba4b44d5a3bc139321a266e83bec69a181f731651c9af59b626752903ef9'
$HASH_PATCHED_KN5 = 'daba83d03fe1981e13e566130e7e7974b25d9add9890dd6a85a071d75146c2c7'
$HASH_NEW_CONFIG = '05b9fb19a3510d3d56f244207c5e1e62b9768f45e0610342e2a2c52dd5cd8be9'

$script:tmpDir = $null
function Remove-Tmp { if ($script:tmpDir -and (Test-Path -LiteralPath $script:tmpDir)) { Remove-Item -LiteralPath $script:tmpDir -Recurse -Force } }
function Stop-With([string]$msg) { Remove-Tmp; Write-Host ""; Write-Host "NOT INSTALLED: $msg" -ForegroundColor Red; exit 1 }
function Hash([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }

function Find-Track {
  $roots = @()
  foreach ($k in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
    try {
      $item = Get-ItemProperty -LiteralPath $k -ErrorAction Stop
      foreach ($n in 'SteamPath', 'InstallPath') { if ($item.PSObject.Properties[$n]) { $roots += ($item.$n -replace '/', '\') } }
    } catch { }
  }
  $libs = @()
  foreach ($r in ($roots | Select-Object -Unique)) {
    $libs += $r
    $vdf = Join-Path $r 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
      $text = [System.IO.File]::ReadAllText($vdf)
      foreach ($m in [regex]::Matches($text, '"path"\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value -replace '\\\\', '\') }
    }
  }
  if (-not $libs) { Stop-With "Steam was not found (no Steam path in the registry). Run again with -TrackPath `"...\content\tracks\$TRACKNAME`"." }
  $found = @()
  foreach ($l in ($libs | Select-Object -Unique)) {
    $game = Join-Path $l 'steamapps\common\assettocorsa'
    if (Test-Path -LiteralPath $game) {
      $t = Join-Path $game "content\tracks\$TRACKNAME"
      if (Test-Path -LiteralPath $t) { $found += $t } else { Write-Host "Assetto Corsa found at $game, but not the track $TRACKNAME." }
    }
  }
  if ($found.Count -eq 0) { Stop-With "the track folder $TRACKNAME was not found in any Steam library ($(@($libs | Select-Object -Unique) -join '; ')). Is the track installed?" }
  return $found[0]
}

function Get-Payload {
  $here = if ($Source) { $Source } else { $PSScriptRoot }
  $zip = Get-ChildItem -LiteralPath $here -Filter '*headlights*.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($zip) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('headlights-' + [guid]::NewGuid())
    $script:tmpDir = $tmp
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $tmp)
    $here = $tmp
  }
  $kn5 = Join-Path $here "$TRACKNAME\$TRACKNAME.kn5"
  $ini = Join-Path $here "$TRACKNAME\extension\ext_config.ini"
  if (-not (Test-Path -LiteralPath $kn5) -or -not (Test-Path -LiteralPath $ini)) {
    Stop-With "the fix's files were not found next to this script: expected the zip, or a folder $TRACKNAME\ holding $TRACKNAME.kn5 and extension\ext_config.ini."
  }
  if ((Hash $kn5) -ne $HASH_PATCHED_KN5) { Stop-With "the fix's $TRACKNAME.kn5 is not the expected file (sha256 mismatch). Download it again." }
  if ((Hash $ini) -ne $HASH_NEW_CONFIG) { Stop-With "the fix's ext_config.ini is not the expected file (sha256 mismatch). Download it again." }
  return @{ kn5 = $kn5; ini = $ini }
}

$track = if ($TrackPath) { $TrackPath } else { Find-Track }
if (-not (Test-Path -LiteralPath $track)) { Stop-With "the track folder was not found: $track" }
Write-Host "Track folder: $track"
if ($FindOnly) { Write-Host "(-FindOnly: nothing changed)"; exit 0 }

if (Get-Process -Name 'acs' -ErrorAction SilentlyContinue) { Stop-With "Assetto Corsa is running (acs.exe). Close it and run this again." }

$liveKn5 = Join-Path $track "$TRACKNAME.kn5"
$bakKn5 = Join-Path $track "$TRACKNAME.kn5.original"
$extDir = Join-Path $track 'extension'
$liveIni = Join-Path $extDir 'ext_config.ini'
$bakIni = Join-Path $extDir 'ext_config.ini.before-headlights'

if (-not (Test-Path -LiteralPath $liveKn5)) { Stop-With "$TRACKNAME.kn5 is missing from $track" }
$h = Hash $liveKn5
if ($h -eq $HASH_PATCHED_KN5 -and (Test-Path -LiteralPath $liveIni) -and (Hash $liveIni) -eq $HASH_NEW_CONFIG) { Write-Host "The headlight fix is already installed. Nothing changed." -ForegroundColor Green; exit 0 }
if ($h -ne $HASH_ORIGINAL_KN5 -and $h -ne $HASH_PATCHED_KN5) { Stop-With "your $TRACKNAME.kn5 is not the version this fix was made for (sha256 $h). Installing it would replace a different track build." }
if ((Test-Path -LiteralPath $bakKn5) -and (Hash $bakKn5) -ne $HASH_ORIGINAL_KN5) { Stop-With "$TRACKNAME.kn5.original already exists and is not the original track file. Not touching it." }

$payload = Get-Payload

# backups: made once, never overwritten
if (-not (Test-Path -LiteralPath $bakKn5)) {
  if ($h -ne $HASH_ORIGINAL_KN5) { Stop-With "no backup of the original track file exists, and the installed one is not the original. Not continuing." }
  Copy-Item -LiteralPath $liveKn5 -Destination $bakKn5
}
$iniBackedUp = $false
if (Test-Path -LiteralPath $liveIni) {
  if (-not (Test-Path -LiteralPath $bakIni)) { Copy-Item -LiteralPath $liveIni -Destination $bakIni; $iniBackedUp = $true }
} elseif (-not (Test-Path -LiteralPath $extDir)) { New-Item -ItemType Directory -Path $extDir | Out-Null }

Copy-Item -LiteralPath $payload.kn5 -Destination $liveKn5 -Force
Copy-Item -LiteralPath $payload.ini -Destination $liveIni -Force

# verify every file touched
$ok = $true
$checks = @(@{ p = $liveKn5; want = $HASH_PATCHED_KN5 }, @{ p = $liveIni; want = $HASH_NEW_CONFIG }, @{ p = $bakKn5; want = $HASH_ORIGINAL_KN5 })
foreach ($c in $checks) { $got = Hash $c.p; $mark = if ($got -eq $c.want) { 'ok' } else { $ok = $false; 'MISMATCH' }; Write-Host ("  {0,-8} {1}  {2}" -f $mark, $got.Substring(0, 16), (Split-Path -Leaf $c.p)) }
if (Test-Path -LiteralPath $bakIni) { Write-Host ("  {0,-8} {1}  {2}{3}" -f 'backup', (Hash $bakIni).Substring(0, 16), (Split-Path -Leaf $bakIni), $(if ($iniBackedUp) { ' (made now)' } else { ' (already existed, kept)' })) }
if (-not $ok) { Stop-With "a file did not verify after copying. Run uninstall.ps1 to put the originals back." }
Remove-Tmp
Write-Host ""
Write-Host "INSTALLED. To undo, run uninstall.ps1." -ForegroundColor Green
