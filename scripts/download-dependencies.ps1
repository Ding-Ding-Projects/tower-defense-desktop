# Obtain every dependency this project needs to build, from a fresh machine, with no
# prompts and nothing installed beforehand.
#
# Everything lands user-scoped. Nothing here needs administrator rights, nothing
# touches a machine-wide toolchain, and nothing installs a certificate.

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

. (Join-Path $PSScriptRoot 'common.ps1')
Read-CommonArgs -Arguments $Arguments

$manifest = Get-BuildManifest
$requiredNodeMajor = [int]($manifest.node.minimumMajor)

Write-Phase "Checking the runtime"

$nodeOk = $false
if (Test-CommandExists 'node') {
  $version = (& node --version).TrimStart('v')
  $major = [int]($version.Split('.')[0])
  if ($major -ge $requiredNodeMajor) {
    Write-Detail "node $version is already present and new enough (need $requiredNodeMajor or later)"
    $nodeOk = $true
  } else {
    Write-Detail "node $version is too old; need $requiredNodeMajor or later"
  }
}

if (-not $nodeOk) {
  # A user-scoped portable install, deliberately: a machine-wide one would need
  # elevation and would mutate a toolchain this project does not own.
  $target = Join-Path $env:LOCALAPPDATA "tower-defence-desktop\toolchain"
  $version = $manifest.node.pinnedVersion
  $archive = "node-v$version-win-x64.zip"
  $url = "https://nodejs.org/dist/v$version/$archive"
  $download = Join-Path $env:TEMP $archive

  Write-Detail "fetching node $version from the canonical distribution"
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Invoke-WebRequest -Uri $url -OutFile $download -UseBasicParsing

  $actual = Get-FileSha256 -Path $download
  $expected = $manifest.node.sha256
  if ($expected -and $expected -ne 'unrecorded' -and $actual -ne $expected) {
    Remove-Item $download -Force
    throw "digest mismatch for $archive. Expected $expected, got $actual. Nothing was placed on disk."
  }
  if (-not $expected -or $expected -eq 'unrecorded') {
    Write-Detail "no digest recorded yet for this version; observed $actual"
  }

  Expand-Archive -LiteralPath $download -DestinationPath $target -Force
  Remove-Item $download -Force
  $env:Path = (Join-Path $target "node-v$version-win-x64") + ';' + $env:Path
  Update-PathInProcess
  Write-Detail "node is now on this process's PATH: $((& node --version))"
}

Write-Phase "Installing project dependencies"
Push-Location $script:RepoRoot
try {
  if (Test-Path (Join-Path $script:RepoRoot 'package-lock.json')) {
    & npm ci --no-audit --no-fund
  } else {
    & npm install --no-audit --no-fund
  }
  if ($LASTEXITCODE -ne 0) { throw "dependency install failed with exit code $LASTEXITCODE" }

  # The install can exit zero and leave the desktop runtime executable absent,
  # because the package manager blocks install scripts by default. Every later step
  # would then run against nothing and report success.
  Write-Phase "Verifying the desktop runtime actually landed"
  & node (Join-Path $script:RepoRoot 'scripts\ensure-electron-binary.mjs')
  if ($LASTEXITCODE -ne 0) { throw "the desktop runtime could not be repaired" }
} finally {
  Pop-Location
}

Write-Phase "Dependencies ready"
Write-Detail "node $((& node --version)), npm $((& npm --version))"
exit 0
