# Creates a separate developer app. Never reads or generates the release signing key.
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { throw 'Set JAVA_HOME to JDK 21 (not its bin directory).' }
if (-not $env:ANDROID_HOME) { throw 'Set ANDROID_HOME to Android SDK with Platform 36 and Build Tools 36.0.0.' }
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat'))) { throw 'Android Build Tools 36.0.0 missing.' }
$oldProfile=$env:SHIRI_BUILD_PROFILE
$env:SHIRI_BUILD_PROFILE='debug'
Push-Location (Join-Path $taskRoot 'android-shell')
try {
  npm run sync
  if($LASTEXITCODE -ne 0){throw 'Debug asset preparation failed.'}
  Push-Location android
  try {
    & ./gradlew.bat --no-daemon '-Dorg.gradle.project.android.overridePathCheck=true' assembleDebug
    if($LASTEXITCODE -ne 0){throw 'Debug APK build failed.'}
  } finally {Pop-Location}
  $apk=Join-Path $taskRoot 'android-shell/android/app/build/outputs/apk/debug/app-debug.apk'
  & (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat') verify $apk
  if($LASTEXITCODE -ne 0){throw 'Debug signature invalid.'}
  Write-Output "Developer APK only (cn.shiri.life.debug): $apk"
} finally {Pop-Location;$env:SHIRI_BUILD_PROFILE=$oldProfile}
