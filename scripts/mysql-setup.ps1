[CmdletBinding()]
param([switch]$SkipSource)
$ErrorActionPreference = 'Stop'
$mysqlProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mysqlRuntimeRoot = Join-Path $mysqlProjectRoot 'runtime'
$mysqlDestination = Join-Path $mysqlRuntimeRoot 'mysql'
$mysqlDownloads = Join-Path $mysqlRuntimeRoot 'downloads'
$mysqlStaging = Join-Path $mysqlProjectRoot ('.local\mysql-setup-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $mysqlDownloads,$mysqlStaging | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$mysqlVersion = '8.4.11'
$mysqlUrl = 'https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11-winx64.zip'
$mysqlSha256 = 'a492371d687d2bab088b0062581144a0044b8964baefdf4faa579292b423d25c'
$mysqlSourceUrl = 'https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11.tar.gz'
$mysqlSourceSha256 = 'eb3051164d625dd346a8203f76e0d5d5d9aec51dbe9d51788e39ec6b3f1394c2'
$mysqlVcUrl = 'https://download.visualstudio.microsoft.com/download/pr/45d3b8dd-bced-4b37-9974-142f748d710c/4aaf54db0bfc9435f7c3660e1a00237a4b556042bfeea64bde44c2e0194e6ee5/Microsoft.VC.14.44.17.14.CRT.Redist.X64.base.vsix'
$mysqlVcSha256 = '4aaf54db0bfc9435f7c3660e1a00237a4b556042bfeea64bde44c2e0194e6ee5'
$mysqlVcLicenseUrl = 'https://visualstudio.microsoft.com/wp-content/uploads/2021/11/Visual-Studio-2022-Community-License-EN.docx'
$mysqlVcLicenseSha256 = '41a207b10c8ab91d0d2f10a854715f73dca54509581692d2fe179aa3ffcb8540'
$mysqlUtf8 = New-Object Text.UTF8Encoding($false)
function Get-VerifiedMySqlDownload([string]$Url,[string]$Name,[string]$Sha256) {
    $target = Join-Path $mysqlDownloads $Name
    if (-not (Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) {
        Write-Host "Downloading $Name from the official upstream..."
        $partial = $target + '.partial'
        $savedProgress = $ProgressPreference
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing
            if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256) { throw "SHA256 mismatch: $Name" }
            Move-Item -LiteralPath $partial -Destination $target -Force
        } finally { $ProgressPreference = $savedProgress }
    }
    return $target
}
function Save-MySqlZipEntry($Entry,[string]$Relative) {
    $resolved = [IO.Path]::GetFullPath((Join-Path $mysqlStaging $Relative))
    $expectedPrefix = $mysqlStaging.TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($expectedPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP path escaped the application runtime staging directory.' }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolved)) | Out-Null
    $input = $Entry.Open()
    $output = [IO.File]::Create($resolved)
    try { $input.CopyTo($output) } finally { $input.Dispose();$output.Dispose() }
}
$mysqlZip = Get-VerifiedMySqlDownload $mysqlUrl 'mysql-8.4.11-winx64.zip' $mysqlSha256
$mysqlVc = Get-VerifiedMySqlDownload $mysqlVcUrl 'Microsoft.VC.CRT.x64-14.44.35211.vsix' $mysqlVcSha256
$mysqlVcLicense = Get-VerifiedMySqlDownload $mysqlVcLicenseUrl 'Visual-Studio-2022-Community-License-EN.docx' $mysqlVcLicenseSha256
if (-not $SkipSource) {
    Get-VerifiedMySqlDownload $mysqlSourceUrl 'mysql-8.4.11.tar.gz' $mysqlSourceSha256 | Out-Null
} elseif (-not (Test-Path -LiteralPath (Join-Path $mysqlDownloads 'mysql-8.4.11.tar.gz'))) {
    Write-Warning 'Source download skipped for local development. Download and publish the matching official source before distributing MySQL binaries.'
}
$mysqlArchive = [IO.Compression.ZipFile]::OpenRead($mysqlZip)
try {
    foreach ($entry in $mysqlArchive.Entries) {
        $relative = $entry.FullName -replace '^mysql-8\.4\.11-winx64/',''
        $name = [IO.Path]::GetFileName($relative)
        $isClient = $relative -in @('bin/mysqld.exe','bin/mysql.exe','bin/mysqladmin.exe')
        $isDll = $relative.StartsWith('bin/') -and $name.EndsWith('.dll') -and -not $name.Contains('-debug')
        $isSupport = $relative -in @('LICENSE','README','docs/INFO_BIN','docs/INFO_SRC','lib/plugin/component_reference_cache.dll') -or $relative.StartsWith('share/') -or $relative.StartsWith('lib/private/')
        if ($entry.Length -gt 0 -and ($isClient -or $isDll -or $isSupport)) { Save-MySqlZipEntry $entry $relative }
    }
} finally { $mysqlArchive.Dispose() }
$mysqlVcArchive = [IO.Compression.ZipFile]::OpenRead($mysqlVc)
try {
    foreach ($entry in $mysqlVcArchive.Entries) {
        if ($entry.FullName.Contains('/x64/Microsoft.VC143.CRT/') -and $entry.FullName.EndsWith('.dll')) {
            Save-MySqlZipEntry $entry ('bin/' + [IO.Path]::GetFileName($entry.FullName))
        }
    }
} finally { $mysqlVcArchive.Dispose() }
$mysqlLicenseArchive = [IO.Compression.ZipFile]::OpenRead($mysqlVcLicense)
try {
    $entry = $mysqlLicenseArchive.GetEntry('word/document.xml')
    $reader = New-Object IO.StreamReader($entry.Open())
    try { [xml]$licenseXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $namespaces = New-Object Xml.XmlNamespaceManager($licenseXml.NameTable)
    $namespaces.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $paragraphs = foreach ($paragraph in $licenseXml.SelectNodes('//w:p',$namespaces)) {
        ($paragraph.SelectNodes('.//w:t',$namespaces) | ForEach-Object { $_.InnerText }) -join ''
    }
    $licenseText = "Source: $mysqlVcLicenseUrl`nExtracted from the official unmodified DOCX document.`n`n" + ($paragraphs -join "`n") + "`n"
    [IO.File]::WriteAllText((Join-Path $mysqlStaging 'LICENSE.Microsoft-VC-CRT.txt'),$licenseText,$mysqlUtf8)
} finally { $mysqlLicenseArchive.Dispose() }
$mysqlFiles = [ordered]@{}
$mysqlVcFiles = [ordered]@{}
$mysqlRuntimeBytes = [long]0
Get-ChildItem -LiteralPath $mysqlStaging -File -Recurse | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($mysqlStaging.Length + 1).Replace('\','/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $mysqlFiles[$relative] = $hash
    $mysqlRuntimeBytes += $_.Length
    if ($relative.StartsWith('bin/') -and $_.Name -like '*140*.dll') { $mysqlVcFiles[$_.Name] = $hash }
}
$mysqlManifest = [ordered]@{
    version = $mysqlVersion
    distribution = 'MySQL Community Server (GPL), official Windows x64 ZIP'
    platform = 'win32-x64'
    verifiedAt = '2026-10-04'
    upstream = 'https://dev.mysql.com/downloads/mysql/8.4.html'
    url = $mysqlUrl
    sha256 = $mysqlSha256
    md5 = '2e833921898a9a030ea6bfe81bd811bc'
    sourceUrl = $mysqlSourceUrl
    sourceSha256 = $mysqlSourceSha256
    sourceMd5 = '7e36429318298eb05a79054309f18cb2'
    sourceArchive = 'downloads/mysql-8.4.11.tar.gz'
    executable = 'mysql/bin/mysqld.exe'
    clientExecutable = 'mysql/bin/mysql.exe'
    license = 'mysql/LICENSE'
    runtimeBytes = $mysqlRuntimeBytes
    minimumWindows = 'Windows 10 x64; Universal CRT supplied by Windows'
    vcRuntime = [ordered]@{
        version = '14.44.35211'
        distribution = 'Official Microsoft Visual Studio 2022 x64 non-debug CRT; application-local DLLs only'
        url = $mysqlVcUrl
        sha256 = $mysqlVcSha256
        license = 'mysql/LICENSE.Microsoft-VC-CRT.txt'
        licenseSource = $mysqlVcLicenseUrl
        licenseSourceSha256 = $mysqlVcLicenseSha256
        redistributionRules = 'https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution'
        files = $mysqlVcFiles
    }
    files = $mysqlFiles
    isolation = 'Application starts its own private data directory on 127.0.0.1 and a random port. No system service is registered; pre-existing MySQL installations are not connected or modified.'
}
[IO.File]::WriteAllText((Join-Path $mysqlStaging 'manifest.json'),(($mysqlManifest | ConvertTo-Json -Depth 8) + "`n"),$mysqlUtf8)
# All mutations below are restricted to the named project runtime; no database service/data is modified.
$mysqlExpected = [IO.Path]::GetFullPath((Join-Path $mysqlProjectRoot 'runtime\mysql'))
if ([IO.Path]::GetFullPath($mysqlDestination) -ne $mysqlExpected -or -not $mysqlExpected.StartsWith($mysqlRuntimeRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe runtime target.' }
if (Test-Path -LiteralPath $mysqlDestination) { Remove-Item -LiteralPath $mysqlDestination -Recurse -Force }
Move-Item -LiteralPath $mysqlStaging -Destination $mysqlDestination
& (Join-Path $mysqlDestination 'bin\mysqld.exe') --no-defaults --version
if ($LASTEXITCODE -ne 0) { throw 'Bundled official MySQL version check failed.' }
& (Join-Path $mysqlDestination 'bin\mysql.exe') --no-defaults --version
if ($LASTEXITCODE -ne 0) { throw 'Bundled official MySQL client version check failed.' }
Write-Host "MySQL $mysqlVersion private application runtime is ready ($mysqlRuntimeBytes bytes). No Windows service was installed."
