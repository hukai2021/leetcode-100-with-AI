$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$target = Join-Path $projectRoot 'runtime\runner-job.exe'
& $compiler /nologo /optimize+ /platform:x64 /target:exe "/out:$target" (Join-Path $PSScriptRoot 'runner-job.cs')
if ($LASTEXITCODE -ne 0) { throw 'Job Object launcher build failed' }
