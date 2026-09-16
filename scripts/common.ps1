# Shared helpers for the three one-click scripts.
#
# Dot-sourced, not imported as a module, because a module would need to be installed
# and the whole point of these scripts is that a fresh machine needs nothing installed.

$ErrorActionPreference = 'Stop'

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:Silent = $false
$script:RunAfterBuild = $false

function Read-CommonArgs {
  param([string[]]$Arguments)

  foreach ($argument in $Arguments) {
    switch -Regex ($argument) {
      '^(/s|--silent|-s)$' { $script:Silent = $true }
      '^(/run|--run|-run)$' { $script:RunAfterBuild = $true }
    }
  }
  if ($env:SILENT -eq '1') { $script:Silent = $true }
  if ($env:RUN_AFTER_BUILD -eq '1') { $script:RunAfterBuild = $true }
}

function Write-Phase {
  param([string]$Message)
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Detail {
  param([string]$Message)
  Write-Host "    $Message"
}

function Write-Problem {
  param([string]$Message)
  Write-Host "    $Message" -ForegroundColor Red
}

# Refresh this process's PATH from the registry.
#
# The documented trap: a package manager updates PATH for FUTURE shells only, so the
# very script that just installed a tool cannot find it, and the failure looks like a
# failed install rather than a stale environment.
function Update-PathInProcess {
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machine, $user, $env:Path) -join ';'
}

function Test-CommandExists {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-BuildManifest {
  $path = Join-Path $script:RepoRoot 'build-manifest.json'
  if (-not (Test-Path $path)) {
    throw "build-manifest.json is missing. It is the single record every script here reads; nothing can proceed without it."
  }
  return Get-Content $path -Raw | ConvertFrom-Json
}

# Assert a built file exists, is non-empty, and is NEWER than every source that
# produced it.
#
# A check that only asks whether the file exists reports green against stale output
# left behind by a build that failed, which is the exact failure this project keeps
# finding in other people's scripts.
function Assert-FreshArtifact {
  param(
    [string]$ArtifactPath,
    [string[]]$SourceDirectories,
    [int]$MinimumBytes = 1
  )

  if (-not (Test-Path $ArtifactPath)) {
    throw "expected build output is absent: $ArtifactPath"
  }
  $artifact = Get-Item $ArtifactPath
  if ($artifact.Length -lt $MinimumBytes) {
    throw "build output is too small to be real: $ArtifactPath is $($artifact.Length) bytes"
  }

  foreach ($directory in $SourceDirectories) {
    $full = Join-Path $script:RepoRoot $directory
    if (-not (Test-Path $full)) { continue }
    $newest = Get-ChildItem $full -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -ne $newest -and $newest.LastWriteTimeUtc -gt $artifact.LastWriteTimeUtc) {
      throw "stale build output: $($newest.FullName) is newer than $ArtifactPath. The build did not actually rebuild."
    }
  }

  Write-Detail "verified $ArtifactPath ($([math]::Round($artifact.Length / 1MB, 2)) MB, newer than its sources)"
}

function Get-FileSha256 {
  param([string]$Path)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLower()
}
