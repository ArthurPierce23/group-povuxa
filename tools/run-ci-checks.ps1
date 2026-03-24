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

& (Join-Path $PSScriptRoot "check-js.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "JavaScript syntax checks failed."
}

Write-Output "All CI checks passed."
