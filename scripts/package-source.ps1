param([string]$Name = 'shiri-source-cloudbase.zip')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($Name -notmatch '^[a-zA-Z0-9._-]+\.zip$') { throw 'Invalid archive name' }
$output = Join-Path $projectRoot "releases/$Name"
if (Test-Path -LiteralPath $output) { throw 'Archive already exists; will not overwrite a recovery copy' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$skip = '(^|/)(node_modules|\.git|\.signing|\.local|\.local-backups|\.tool-cache|\.model-downloads|\.site-publish|\.agents|\.codex|\.aws|\.openai|\.superpowers|releases|www|build|\.gradle)(/|$)|^social-server/data/|(^|/)\.env($|\.(?!example$))|\.(jks|keystore|pem|p12|pfx|apk|sqlite|sqlite3|db|log|partial)$|(^|/)local\.properties$|^site-release\.tar\.gz$'
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
$count = 0
try {
    foreach ($file in Get-ChildItem -LiteralPath $projectRoot -File -Recurse -Force) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
        if ($relative -match $skip -or $relative.StartsWith('android-shell/android/app/src/main/assets/public/') -or $file.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, "shiri/$relative", [IO.Compression.CompressionLevel]::Fastest) | Out-Null
        $count++
    }
} finally { $archive.Dispose(); $stream.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($output)
try { if ($check.Entries.Count -ne $count) { throw 'Entry count mismatch' } } finally { $check.Dispose() }
Get-Item -LiteralPath $output | Select-Object FullName,Length
Get-FileHash -LiteralPath $output -Algorithm SHA256
Write-Output "Verified $count source entries; local data, credentials and build caches excluded."
