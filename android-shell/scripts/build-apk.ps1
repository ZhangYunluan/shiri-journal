$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskShell=Join-Path $taskRoot 'android-shell'
$taskTools=Join-Path $taskRoot '.tool-cache/android-build'
$env:JAVA_HOME=Join-Path $taskTools 'jdk/jdk-21.0.12.1+1'
$env:ANDROID_HOME=Join-Path $taskTools 'sdk'
$env:GRADLE_USER_HOME=Join-Path $taskTools 'gradle'
$oldProfile=$env:SHIRI_BUILD_PROFILE
$env:SHIRI_BUILD_PROFILE='release'
$taskSigner=Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat'
if (-not (Test-Path $taskSigner)) { throw 'Android SDK is not configured. Complete setup after accepting its license.' }
Push-Location $taskShell
try {
  npm run sync
  if ($LASTEXITCODE -ne 0) { throw 'Native asset sync failed.' }
  if (-not (Test-Path '.signing/shiri-release.jks') -or -not (Test-Path '.signing/signing.properties')) { throw 'Existing release identity is required. Restore the signing backup; never generate a replacement.' }
  node scripts/create-signing-key.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Signing key setup failed.' }
  $taskArgs=@('--no-daemon','-Dorg.gradle.project.android.overridePathCheck=true','assembleRelease')
  if ($env:SHIRI_BUILD_PROXY_PORT) {
    $taskArgs=@('-Dhttps.proxyHost=127.0.0.1',"-Dhttps.proxyPort=$env:SHIRI_BUILD_PROXY_PORT",'-Dhttp.proxyHost=127.0.0.1',"-Dhttp.proxyPort=$env:SHIRI_BUILD_PROXY_PORT")+$taskArgs
  }
  Push-Location (Join-Path $taskShell 'android')
  try { & ./gradlew.bat @taskArgs; if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' } } finally { Pop-Location }
  $taskApk=Join-Path $taskShell 'android/app/build/outputs/apk/release/app-release.apk'
  $taskSignature = & $taskSigner verify --verbose --print-certs $taskApk
  $taskSignature
  if ($LASTEXITCODE -ne 0) { throw 'APK signature validation failed.' }
  if (-not ($taskSignature -match 'certificate SHA-256 digest: 18b016b5e0c67c9931b1e76436180154e8d46792a343e4a3cb4b34b33b1681ad')) { throw 'Release certificate changed; refusing to distribute an incompatible update.' }
  & (Join-Path $PSScriptRoot 'verify-assets.ps1') -Apk $taskApk
  $taskRelease=Join-Path $taskRoot 'releases'
  New-Item -ItemType Directory -Force -Path $taskRelease | Out-Null
  $taskOutput=Join-Path $taskRelease 'shiri-0.8.3-release.apk'
  Copy-Item -LiteralPath $taskApk -Destination $taskOutput
  $taskChecksum=(Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($taskOutput+'.sha256', $taskChecksum+'  shiri-0.8.3-release.apk'+[Environment]::NewLine)
  Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256 | Select-Object Path,Hash
} finally { Pop-Location; $env:SHIRI_BUILD_PROFILE=$oldProfile }
