param([string]$RuntimeDirectory = '')
$ErrorActionPreference = 'Stop'
$coachProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$coachRuntimeRoot = if ($RuntimeDirectory) { [IO.Path]::GetFullPath($RuntimeDirectory) } else { Join-Path $coachProjectRoot 'runtime' }
if (-not $coachRuntimeRoot.StartsWith($coachProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'RuntimeDirectory must be a subdirectory of this project.' }
$coachDownloads = Join-Path $coachProjectRoot 'runtime\downloads'
$coachManifest = Get-Content -Raw -LiteralPath (Join-Path $coachProjectRoot 'runtime\manifest.json') | ConvertFrom-Json
# Treat the pinned self-extracting package as archive data. Never execute it.
$coachExtractor = Join-Path $coachProjectRoot 'node_modules\electron-winstaller\vendor\7z-x64.exe'
if (-not (Test-Path -LiteralPath $coachExtractor)) { throw 'Run npm ci first to install the locked archive extraction tool.' }
New-Item -ItemType Directory -Force -Path $coachDownloads, $coachRuntimeRoot | Out-Null
$coachAssets = @($coachManifest.python, $coachManifest.cpp, [PSCustomObject]@{ url=$coachManifest.cpp.sourceUrl; sha256=$coachManifest.cpp.sourceSha256 })
foreach ($coachComponent in $coachAssets) {
    $coachName = [IO.Path]::GetFileName(([Uri]$coachComponent.url).AbsolutePath)
    if ($coachComponent.url -eq $coachManifest.cpp.sourceUrl) { $coachName = [IO.Path]::GetFileName($coachManifest.cpp.sourceArchive) }
    $coachAsset = Join-Path $coachDownloads $coachName
    if (-not (Test-Path -LiteralPath $coachAsset)) { Invoke-WebRequest -UseBasicParsing -Uri $coachComponent.url -OutFile $coachAsset }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $coachAsset).Hash.ToLowerInvariant() -ne $coachComponent.sha256) { throw "SHA256 mismatch: $coachName" }
    Write-Output "Verified official archive: $coachName"
}
$coachLocalRoot = Join-Path $coachProjectRoot '.local'
$coachStage = Join-Path $coachLocalRoot ('runner-setup-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $coachStage -Force | Out-Null
try {
    $coachPythonArchive = Join-Path $coachDownloads ([IO.Path]::GetFileName(([Uri]$coachManifest.python.url).AbsolutePath))
    $coachPythonStage = Join-Path $coachStage 'python'
    Expand-Archive -LiteralPath $coachPythonArchive -DestinationPath $coachPythonStage
    $coachCppArchive = Join-Path $coachDownloads ([IO.Path]::GetFileName(([Uri]$coachManifest.cpp.url).AbsolutePath))
    & $coachExtractor x -t7z $coachCppArchive ("-o" + $coachStage) -y
    # The hash-verified official SFX has trailing data; 7-Zip reports warning 1.
    if ($LASTEXITCODE -notin @(0,1)) { throw "Archive extraction failed: $LASTEXITCODE" }
    $coachCppStage = Join-Path $coachStage 'w64devkit'
    foreach ($coachRequired in @((Join-Path $coachPythonStage 'python.exe'),(Join-Path $coachCppStage 'bin\g++.exe'))) {
        if (-not (Test-Path -LiteralPath $coachRequired)) { throw 'Official archive did not contain its expected runtime.' }
    }
    $coachPythonTarget = Join-Path $coachRuntimeRoot 'python'
    $coachCppTarget = Join-Path $coachRuntimeRoot 'w64devkit'
    New-Item -ItemType Directory -Path $coachPythonTarget, $coachCppTarget -Force | Out-Null
    Get-ChildItem -LiteralPath $coachPythonStage -Force | Copy-Item -Destination $coachPythonTarget -Recurse -Force
    Get-ChildItem -LiteralPath $coachCppStage -Force | Copy-Item -Destination $coachCppTarget -Recurse -Force
    $coachCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    $coachJobSource = Join-Path $PSScriptRoot 'runner-job.cs'
    $coachJobTarget = Join-Path $coachRuntimeRoot 'runner-job.exe'
    & $coachCompiler /nologo /optimize+ /platform:x64 /target:exe ("/out:" + $coachJobTarget) $coachJobSource
    if ($LASTEXITCODE -ne 0) { throw 'Job Object launcher build failed.' }
    & (Join-Path $coachPythonTarget 'python.exe') --version
    if ($LASTEXITCODE -ne 0) { throw 'Python runtime verification failed.' }
    & (Join-Path $coachCppTarget 'bin\g++.exe') --version
    if ($LASTEXITCODE -ne 0) { throw 'C++ compiler verification failed.' }
    Write-Output 'Official Python/C++ runtimes and Job Object launcher prepared.'
} finally {
    $coachAbsoluteStage = [IO.Path]::GetFullPath($coachStage)
    if (-not $coachAbsoluteStage.StartsWith($coachLocalRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Staging cleanup path is outside the project staging directory.' }
    Remove-Item -LiteralPath $coachAbsoluteStage -Recurse -Force
}
