# Build the real artifact, verify it is genuinely fresh, and only then offer to run it.
#
# There is no transpile step: the project is plain ES modules with JSDoc types, so
# "building" means proving the tree is correct and the runtime is present, which is
# exactly what the checks below do. That is stated plainly rather than hidden behind a
# build step that copies files around to look busy.

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

. (Join-Path $PSScriptRoot 'common.ps1')
Read-CommonArgs -Arguments $Arguments

Push-Location $script:RepoRoot
try {
  Write-Phase "Type checking"
  & npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "type check failed" }

  Write-Phase "Checking the simulation cannot read a clock or a platform random source"
  & node tools/check-determinism.mjs
  if ($LASTEXITCODE -ne 0) { throw "determinism check failed" }

  Write-Phase "Validating the data"
  & node tools/validate-data.mjs
  if ($LASTEXITCODE -ne 0) { throw "data validation failed" }

  Write-Phase "Generating the application icon"
  & node tools/generate-icon.mjs
  if ($LASTEXITCODE -ne 0) { throw "icon generation failed" }
  Assert-FreshArtifact -ArtifactPath (Join-Path $script:RepoRoot 'build\icon.ico') `
    -SourceDirectories @('tools') -MinimumBytes 1000

  Write-Phase "Running the checks"
  & npm test
  if ($LASTEXITCODE -ne 0) { throw "checks failed" }

  Write-Phase "Verifying the desktop runtime"
  & node scripts/ensure-electron-binary.mjs
  if ($LASTEXITCODE -ne 0) { throw "the desktop runtime is not usable" }

  Write-Phase "Build complete"
  Write-Detail "the application is ready to run with: npm start"
} finally {
  Pop-Location
}

# Launching happens only after everything above succeeded, and only when a person is
# actually watching. A silent run must never open a window unexpectedly.
if ($script:RunAfterBuild) {
  if ($script:Silent) {
    Write-Detail "silent mode: not launching, even though a run was requested"
  } else {
    Write-Phase "Launching"
    Push-Location $script:RepoRoot
    try { & npm start } finally { Pop-Location }
  }
} elseif (-not $script:Silent) {
  $answer = Read-Host "Launch the application now? [y/N]"
  if ($answer -match '^(y|yes)$') {
    Push-Location $script:RepoRoot
    try { & npm start } finally { Pop-Location }
  }
}

exit 0
