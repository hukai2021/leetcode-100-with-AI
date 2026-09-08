$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'runtime'
$downloads = Join-Path $runtimeRoot 'downloads'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $runtimeRoot 'manifest.json') | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
foreach ($component in @($manifest.python, $manifest.cpp)) {
  $asset = Join-Path $downloads ([System.IO.Path]::GetFileName($component.url))
  if (!(Test-Path -LiteralPath $asset)) { Invoke-WebRequest -Uri $component.url -OutFile $asset }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $asset).Hash.ToLower() -ne $component.sha256) { throw "SHA256 mismatch: $asset" }
}
$pythonArchive = Join-Path $downloads ([System.IO.Path]::GetFileName($manifest.python.url))
Expand-Archive -LiteralPath $pythonArchive -DestinationPath (Join-Path $runtimeRoot 'python') -Force
$gccArchive = Join-Path $downloads ([System.IO.Path]::GetFileName($manifest.cpp.url))
$gccProcess = Start-Process -FilePath $gccArchive -ArgumentList @('-y', ('-o"' + $runtimeRoot + '"')) -WindowStyle Hidden -Wait -PassThru
if ($gccProcess.ExitCode -ne 0) { throw "GCC extraction failed with exit code $($gccProcess.ExitCode)" }
& (Join-Path $PSScriptRoot 'runner-build-job.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Job Object launcher build failed' }
& (Join-Path $runtimeRoot 'python\python.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Python runtime verification failed' }
& (Join-Path $runtimeRoot 'w64devkit\bin\g++.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'C++ compiler verification failed' }
