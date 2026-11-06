param([switch]$AcceptSdkLicense)
$ErrorActionPreference='Stop'
if (-not $AcceptSdkLicense) { throw 'Requires user acceptance of https://developer.android.com/studio/terms; rerun with -AcceptSdkLicense only after acceptance.' }
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskTools=Join-Path $taskRoot '.tool-cache/android-build'
$taskSdk=Join-Path $taskTools 'sdk'
$env:JAVA_HOME=Join-Path $taskTools 'jdk/jdk-21.0.12.1+1'
if (-not (Test-Path (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { throw 'Verified JDK 21 is missing.' }
$taskArchive=Join-Path $taskTools 'commandline-tools.zip'
$taskExpected='90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
if (-not (Test-Path $taskArchive)) {
  Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' -OutFile $taskArchive
}
if ((Get-FileHash $taskArchive -Algorithm SHA256).Hash -ne $taskExpected) { throw 'Android command-line tools checksum mismatch.' }
$taskUnpack=Join-Path $taskTools 'commandline-unpacked'
if (-not (Test-Path (Join-Path $taskSdk 'cmdline-tools/latest/bin/sdkmanager.bat'))) {
  Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskUnpack -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $taskSdk 'cmdline-tools/latest') | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $taskUnpack 'cmdline-tools') | Copy-Item -Destination (Join-Path $taskSdk 'cmdline-tools/latest') -Recurse -Force
}
$taskManager=Join-Path $taskSdk 'cmdline-tools/latest/bin/sdkmanager.bat'
$taskProxy=@()
if ($env:SHIRI_BUILD_PROXY_PORT) { $taskProxy=@('--proxy=http','--proxy_host=127.0.0.1',"--proxy_port=$env:SHIRI_BUILD_PROXY_PORT") }
# Accept only terms presented for these required packages, not unrelated SDK add-ons.
1..10 | ForEach-Object { 'y' } | & $taskManager "--sdk_root=$taskSdk" @taskProxy 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
if ($LASTEXITCODE -ne 0) { throw 'SDK package installation failed.' }
Write-Output 'Android SDK is ready in the project tool cache.'
