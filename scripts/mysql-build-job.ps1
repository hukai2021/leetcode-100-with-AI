param()
$ErrorActionPreference='Stop'
$coachMysqlRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$coachMysqlCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$coachMysqlSource=Join-Path $coachMysqlRoot 'scripts\mysql-job.cs'
$coachMysqlTarget=Join-Path $coachMysqlRoot 'runtime\mysql-job.exe'
if(-not (Test-Path -LiteralPath $coachMysqlCompiler)){throw '缺少 Windows .NET Framework 编译器，无法准备MySQL进程管理程序。'}
& $coachMysqlCompiler /nologo /target:exe ('/out:'+$coachMysqlTarget) $coachMysqlSource
if($LASTEXITCODE -ne 0){throw 'MySQL进程管理程序编译失败。'}
