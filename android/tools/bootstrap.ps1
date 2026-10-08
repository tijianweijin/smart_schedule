param([switch]$AcceptSdkLicense)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$toolRoot = Join-Path $projectRoot '.local\android-tools'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
function Fetch-Verified($url, $target, $sha256) {
    if (!(Test-Path -LiteralPath $target)) {
        Write-Host "Downloading $(Split-Path $target -Leaf)"
        & curl.exe --fail --location --retry 3 --silent --show-error --output $target $url
        if ($LASTEXITCODE -ne 0) { throw 'Download failed.' }
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256.ToLowerInvariant()) { throw "Checksum mismatch: $target" }
}
$jdkRoot = Join-Path $toolRoot 'jdk'
if (!(Test-Path -LiteralPath $jdkRoot)) {
    $checksum = (Invoke-RestMethod 'https://corretto.aws/downloads/latest_sha256/amazon-corretto-21-x64-windows-jdk.zip').Trim().Split(' ')[0]
    $archive = Join-Path $toolRoot 'corretto-jdk.zip'
    Fetch-Verified 'https://corretto.aws/downloads/latest/amazon-corretto-21-x64-windows-jdk.zip' $archive $checksum
    $extract = Join-Path $toolRoot 'jdk-extract'
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    Move-Item -LiteralPath (Get-ChildItem -LiteralPath $extract -Directory | Select-Object -First 1).FullName -Destination $jdkRoot
}
$sdkRoot = Join-Path $toolRoot 'sdk'
$sdkManager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
if (!(Test-Path -LiteralPath $sdkManager)) {
    $archive = Join-Path $toolRoot 'sdk-tools.zip'
    Fetch-Verified 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $archive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    $extract = Join-Path $toolRoot 'sdk-extract'
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    New-Item -ItemType Directory -Path (Join-Path $sdkRoot 'cmdline-tools') -Force | Out-Null
    Move-Item -LiteralPath (Join-Path $extract 'cmdline-tools') -Destination (Join-Path $sdkRoot 'cmdline-tools\latest')
}
$gradleRoot = Join-Path $toolRoot 'gradle-8.11.1'
if (!(Test-Path -LiteralPath $gradleRoot)) {
    $archive = Join-Path $toolRoot 'gradle.zip'
    $checksum = (Invoke-RestMethod 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip.sha256').Trim()
    Fetch-Verified 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip' $archive $checksum
    Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
}
$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
if (!$AcceptSdkLicense) { throw 'Pass -AcceptSdkLicense only after agreeing to https://developer.android.com/studio#terms-and-conditions' }
1..20 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$sdkRoot" 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'
if ($LASTEXITCODE -ne 0) { throw 'SDK package installation failed.' }
Write-Host 'Android build tools ready.'
