param([switch]$Release, [switch]$Install, [switch]$Test)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$toolRoot=Join-Path $projectRoot '.local\android-tools'
$env:JAVA_HOME=Join-Path $toolRoot 'jdk'
$env:ANDROID_HOME=Join-Path $toolRoot 'sdk'
$env:ANDROID_USER_HOME=Join-Path $toolRoot 'android-user'
$env:GRADLE_USER_HOME=Join-Path $toolRoot 'gradle-cache'
if(!$env:KETIME_BUILD_PYTHON){$env:KETIME_BUILD_PYTHON=(Get-Command python -ErrorAction Stop).Source}
& (Join-Path $env:JAVA_HOME 'bin\java.exe') -version
if($LASTEXITCODE -ne 0){throw 'Run tools/bootstrap.ps1 first.'}
$gradle=Join-Path $toolRoot 'gradle-8.11.1\bin\gradle.bat'
$tasks=@('assembleDebug','assembleDebugAndroidTest')
if($Release){$tasks=@('assembleRelease')}
if($Test){$tasks+=@('connectedDebugAndroidTest')}
$cacheName=if($Release){'project-cache-release'}else{'project-cache-debug'}
& $gradle -p (Join-Path $projectRoot 'android') --project-cache-dir (Join-Path $toolRoot $cacheName) --no-daemon @tasks
if($LASTEXITCODE -ne 0){throw 'Android build failed.'}
if($Release){& $env:KETIME_BUILD_PYTHON (Join-Path $PSScriptRoot 'sign-release.py');if($LASTEXITCODE -ne 0){throw 'Release signing failed.'}}
if(!$Release){
    $artifact=Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
    $dist=Join-Path $projectRoot 'android\dist'
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    Copy-Item -LiteralPath $artifact -Destination (Join-Path $dist '刻时-Android-1.0-debug.apk') -Force
    Get-FileHash -LiteralPath (Join-Path $dist '刻时-Android-1.0-debug.apk') -Algorithm SHA256
    if($Install){& (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') install -r $artifact;if($LASTEXITCODE -ne 0){throw 'APK installation failed.'}}
}
$previewNode=Get-Command node -ErrorAction SilentlyContinue
if($previewNode){
    & $previewNode.Source (Join-Path $projectRoot 'tools\build-android-preview.js')
    if($LASTEXITCODE -ne 0){throw 'Android APK built, but Edge preview generation failed.'}
}else{Write-Warning 'APK built. Node.js is needed only to regenerate the standalone Edge preview, not to open it.'}
