param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$files = @()
$searchRoots = @(
    (Join-Path $root "scripts"),
    (Join-Path $root "tools")
)

foreach ($searchRoot in $searchRoots) {
    if (-not (Test-Path $searchRoot)) {
        continue
    }

    $files += Get-ChildItem -Path $searchRoot -Recurse -File -Include *.js,*.mjs | Sort-Object FullName
}

if (-not $files -or $files.Count -eq 0) {
    throw "No JavaScript files found to validate."
}

foreach ($file in $files) {
    & node --check $file.FullName

    if ($LASTEXITCODE -ne 0) {
        $relativePath = [System.IO.Path]::GetRelativePath($root, $file.FullName)
        throw "JavaScript syntax check failed for $relativePath"
    }
}

Write-Output "JavaScript syntax OK: $($files.Count) files"
