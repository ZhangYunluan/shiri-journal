param([Parameter(Mandatory=$true)][string]$Apk)
$ErrorActionPreference='Stop'
$taskShell=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Apk))
try {
  $taskEntries=@($taskZip.Entries | Where-Object { $_.FullName.StartsWith('assets/public/') -and $_.Length -gt 0 })
  $taskSourceRoot=[IO.Path]::GetFullPath((Join-Path $taskShell 'www')) + [IO.Path]::DirectorySeparatorChar
  foreach ($taskEntry in $taskEntries) {
    $taskSource=[IO.Path]::GetFullPath((Join-Path $taskSourceRoot $taskEntry.FullName.Substring(14)))
    if (-not $taskSource.StartsWith($taskSourceRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe asset path' }
    if (-not (Test-Path -LiteralPath $taskSource -PathType Leaf)) { throw ('Packaged asset path differs from prepared source: ' + $taskEntry.FullName) }
    $taskStream=$taskEntry.Open()
    try { $taskHash=(Get-FileHash -InputStream $taskStream -Algorithm SHA256).Hash } finally { $taskStream.Dispose() }
    if ($taskHash -ne (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash) { throw ('Packaged bytes differ: ' + $taskEntry.FullName) }
  }
  # Check the opposite direction too: no prepared model or script can silently disappear.
  foreach ($taskFile in Get-ChildItem -LiteralPath $taskSourceRoot -File -Recurse) {
    $taskName='assets/public/' + $taskFile.FullName.Substring($taskSourceRoot.Length).Replace('\','/')
    if (-not $taskZip.GetEntry($taskName)) { throw ('Asset missing from APK: ' + $taskName) }
  }
  if (@($taskZip.Entries | Where-Object { $_.FullName -match '\.jks$|signing.properties|\.env$|backup.*\.zip$|\.git/' }).Count) { throw 'Private file detected in APK' }
  Write-Output "Verified $($taskEntries.Count) packaged assets: exact paths and SHA-256, no signing keys or backups."
} finally { $taskZip.Dispose() }
