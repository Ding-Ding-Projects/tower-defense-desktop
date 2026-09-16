# Produce the same installer the release workflow publishes, and prove what it is.
#
# The installer is PERMANENTLY UNSIGNED. That is a deliberate project decision, not an
# oversight and not something to be repaired by acquiring a certificate. What matters
# is that the script says so out loud, and that it verifies the claim rather than
# asserting it: an installer that quietly became signed would be just as much a
# surprise as one that quietly became unsigned.
#
# It never publishes, tags or pushes. Producing an artifact and releasing one are
# separate authorities on purpose.

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

. (Join-Path $PSScriptRoot 'common.ps1')
Read-CommonArgs -Arguments $Arguments

$manifest = Get-BuildManifest
Push-Location $script:RepoRoot
try {
  $version = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
  $commit = (& git rev-parse HEAD).Trim()

  Write-Phase "Packaging version $version from commit $($commit.Substring(0,12))"

  & node tools/generate-icon.mjs
  if ($LASTEXITCODE -ne 0) { throw "icon generation failed" }

  & npx electron-builder --win squirrel --publish never
  if ($LASTEXITCODE -ne 0) { throw "packaging failed with exit code $LASTEXITCODE" }

  Write-Phase "Verifying what was actually produced"

  $releaseDir = Join-Path $script:RepoRoot 'release'
  # Searched recursively. The packager writes into a target-named subdirectory, so a
  # flat look reported "no installer was produced" about an installer that had just
  # been produced, one directory down.
  $setup = Get-ChildItem $releaseDir -Recurse -Filter '*Setup*.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($null -eq $setup) { throw "no Setup executable was produced in $releaseDir" }

  $releasesFile = (Get-ChildItem $releaseDir -Recurse -Filter 'RELEASES' -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($null -eq $releasesFile) { throw "the RELEASES file is missing; this is not a complete Squirrel package" }

  $nupkg = Get-ChildItem $releaseDir -Recurse -Filter '*.nupkg' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '*delta*' } | Select-Object -First 1
  if ($null -eq $nupkg) { throw "no full package was produced" }

  Assert-FreshArtifact -ArtifactPath $setup.FullName -SourceDirectories @('src', 'electron') -MinimumBytes 10000000

  Write-Phase "Signature status"
  foreach ($file in @($setup.FullName)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    Write-Detail "$([System.IO.Path]::GetFileName($file)): $($signature.Status)"
    if ($signature.Status -ne 'NotSigned') {
      throw "expected an unsigned artifact; $file reports $($signature.Status). This project does not sign, so something changed that nobody recorded."
    }
  }
  Write-Detail "UNSIGNED, as intended. Windows will show an unknown publisher warning."
  Write-Detail "That is stated in the release notes; it is not a defect and not a claim of safety."

  Write-Phase "Artifacts"
  Write-Detail "setup    : $($setup.FullName)"
  Write-Detail "size     : $([math]::Round($setup.Length / 1MB, 2)) MB"
  Write-Detail "sha256   : $(Get-FileSha256 -Path $setup.FullName)"
  Write-Detail "package  : $($nupkg.FullName)"
  Write-Detail "releases : $($releasesFile.FullName)"
  Write-Detail "commit   : $commit"
  Write-Detail "unsigned : $(-not $manifest.packaging.signed)"

  Write-Host ''
  Write-Host "Nothing has been published, tagged or pushed. That is a separate step." -ForegroundColor Yellow
} finally {
  Pop-Location
}

exit 0
