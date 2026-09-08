param([switch]$Package)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$coachNode = (Get-Command node -ErrorAction SilentlyContinue).Source
$bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (Test-Path -LiteralPath $bundledNode) { $coachNode = $bundledNode }
if (-not $coachNode) { throw '构建需要 Node.js 22.12+，请先安装 Node.js。已安装的软件日常使用无需 Node。' }
$major = [int](((& $coachNode --version) -replace '^v', '').Split('.')[0])
if ($major -lt 22) { throw '构建需要 Node.js 22.12+。' }
$env:Path = (Split-Path -Parent $coachNode) + ';' + $env:Path
if (-not (Test-Path -LiteralPath './node_modules/typescript/bin/tsc')) { throw '请先 npm ci 安装锁定依赖。' }
& $coachNode './node_modules/electron/install.js'
if ($LASTEXITCODE -ne 0) { throw 'Electron 二进制准备失败。' }
& $coachNode './node_modules/typescript/bin/tsc' --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript 检查失败。' }
& $coachNode './node_modules/vite/bin/vite.js' build
if ($LASTEXITCODE -ne 0) { throw '界面构建失败。' }
& $coachNode './scripts/prepare-package.cjs'
if ($LASTEXITCODE -ne 0) { throw 'Codex 打包准备失败。' }
if ($Package) {
  foreach ($runtimeFile in @('runtime/python/python.exe','runtime/w64devkit/bin/g++.exe','runtime/runner-job.exe')) {
    if (-not (Test-Path -LiteralPath $runtimeFile)) { throw "缺少运行依赖 $runtimeFile，请运行 scripts/runner-setup.ps1。" }
  }
  & $coachNode './node_modules/electron-builder/cli.js' --win nsis --x64
  if ($LASTEXITCODE -ne 0) { throw 'Windows 安装包构建失败。' }
}
