param(
    [string]$Tag,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Tag -and $ExtraArgs) {
    for ($index = 0; $index -lt $ExtraArgs.Count; $index += 1) {
        if ($ExtraArgs[$index] -eq "--tag" -and $index + 1 -lt $ExtraArgs.Count) {
            $Tag = $ExtraArgs[$index + 1]
            break
        }
    }
}

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "module.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$distDir = Join-Path $root "dist"
$releaseDir = Join-Path $distDir "release"
$stagingDir = Join-Path $distDir "staging"
$verifyDir = Join-Path $distDir "verify"
$moduleDir = Join-Path $stagingDir $manifest.id
$releaseManifestPath = Join-Path $releaseDir "module.json"
$releaseZipPath = Join-Path $releaseDir "module.zip"
$payload = @(
    "module.json",
    "README.md",
    "LICENSE",
    "assets",
    "lang",
    "scripts",
    "styles",
    "templates"
)

$validateArgs = @(
    (Join-Path $root "tools\validate-manifest.mjs")
)

if ($Tag) {
    $validateArgs += @("--tag", $Tag)
}

& node @validateArgs
if ($LASTEXITCODE -ne 0) {
    throw "Manifest validation failed."
}

Remove-Item -Path $distDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
New-Item -ItemType Directory -Path $moduleDir -Force | Out-Null

foreach ($item in $payload) {
    Copy-Item -Path (Join-Path $root $item) -Destination (Join-Path $moduleDir $item) -Recurse -Force
}

Copy-Item -Path $manifestPath -Destination $releaseManifestPath -Force

Compress-Archive -Path $moduleDir -DestinationPath $releaseZipPath -CompressionLevel Optimal
Expand-Archive -Path $releaseZipPath -DestinationPath $verifyDir -Force

$entries = @(Get-ChildItem -Path $verifyDir -Force)
if ($entries.Count -ne 1 -or -not $entries[0].PSIsContainer -or $entries[0].Name -ne $manifest.id) {
    throw "module.zip must unpack to a single top-level directory named $($manifest.id)."
}

$unpackedModuleDir = Join-Path $verifyDir $manifest.id
$unpackedManifest = Join-Path $unpackedModuleDir "module.json"
if (-not (Test-Path $unpackedManifest)) {
    throw "The unpacked release archive does not contain module.json."
}

Remove-Item -Path $verifyDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Output "Release assets ready in dist/release"
Write-Output "- dist/release/module.json"
Write-Output "- dist/release/module.zip"
