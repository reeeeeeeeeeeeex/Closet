param([switch]$SkipWebBuild, [switch]$DebugBuild)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
}
$taskJdk = if ($env:CLOSET_JAVA_HOME) { $env:CLOSET_JAVA_HOME } else { (Get-ChildItem '.local/android-tools/jdk21' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $taskJdk) { throw 'Set CLOSET_JAVA_HOME to a JDK 21 installation (see docs/android.md).' }
$taskSdk = $env:ANDROID_HOME
if (-not $taskSdk) { $taskSdk = $env:ANDROID_SDK_ROOT }
if (-not $taskSdk) { $taskSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (-not (Test-Path -LiteralPath $taskSdk)) { throw 'Set ANDROID_HOME to an Android SDK with platform 36 and build-tools 36.0.0.' }
$env:JAVA_HOME = $taskJdk
$env:GRADLE_USER_HOME = Join-Path (Get-Location) '.local/gradle-home'
$taskSdkProperty = $taskSdk.Replace('\','/')
[IO.File]::WriteAllText((Join-Path (Get-Location) 'android/local.properties'), "sdk.dir=$taskSdkProperty`n")
if (-not $SkipWebBuild) { Invoke-Checked 'pnpm.cmd' @('build') }
Invoke-Checked 'node' @('node_modules/vite/bin/vite.js','build','--config','mobile/vite.config.ts')
Invoke-Checked 'node' @('node_modules/@capacitor/cli/bin/capacitor','sync','android')
$signingDir = Join-Path (Get-Location) '.local/android-signing'
$keyFile = Join-Path $signingDir 'closet-release.jks'
$propertyFile = Join-Path $signingDir 'release.properties'
if (-not $DebugBuild -and -not (Test-Path -LiteralPath $keyFile)) {
    if (Test-Path -LiteralPath $propertyFile) { throw 'Signing properties exist without the key. Restore the existing key; do not silently generate a replacement.' }
    New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
    $keyPasswordBytes = New-Object byte[] 32
    $keyRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $keyRandom.GetBytes($keyPasswordBytes) } finally { $keyRandom.Dispose() }
    $env:CLOSET_KEY_PASSWORD = [Convert]::ToBase64String($keyPasswordBytes)
    try {
        Invoke-Checked (Join-Path $taskJdk 'bin/keytool.exe') @('-genkeypair','-keystore',$keyFile,'-storetype','JKS','-alias','closet','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=New Closet, OU=Private App, O=New Closet','-storepass:env','CLOSET_KEY_PASSWORD','-keypass:env','CLOSET_KEY_PASSWORD')
        [IO.File]::WriteAllText($propertyFile, "storePassword=$env:CLOSET_KEY_PASSWORD`nkeyPassword=$env:CLOSET_KEY_PASSWORD`n")
    } finally { Remove-Item Env:CLOSET_KEY_PASSWORD -ErrorAction SilentlyContinue }
}
if (-not $DebugBuild -and -not (Test-Path -LiteralPath $propertyFile)) { throw 'Restore release.properties for the existing signing key.' }
$taskGradle = if ($env:CLOSET_GRADLE) { $env:CLOSET_GRADLE } else { Join-Path (Get-Location) 'android/gradlew.bat' }
$gradleTask = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
Invoke-Checked $taskGradle @('-p','android',$gradleTask,'--no-daemon','--console=plain')
New-Item -ItemType Directory -Force -Path 'outputs/android' | Out-Null
$variant = if ($DebugBuild) { 'debug' } else { 'release' }
$taskVersion = [regex]::Match([IO.File]::ReadAllText((Join-Path (Get-Location) 'android/app/build.gradle')), 'versionName\s+"([^"]+)"').Groups[1].Value
if (-not $taskVersion) { throw 'Android versionName is missing.' }
$apkName = if ($DebugBuild) { "new-closet-$taskVersion-test.apk" } else { "new-closet-$taskVersion.apk" }
$destination = Join-Path 'outputs/android' $apkName
Copy-Item -LiteralPath "android/app/build/outputs/apk/$variant/app-$variant.apk" -Destination $destination
Invoke-Checked (Join-Path $taskSdk 'build-tools/36.0.0/apksigner.bat') @('verify','--verbose',$destination)
$taskHash = [Security.Cryptography.SHA256]::Create()
$taskApkStream = [IO.File]::OpenRead((Join-Path (Get-Location) $destination))
try { $checksum = ([BitConverter]::ToString($taskHash.ComputeHash($taskApkStream))).Replace('-', '').ToLowerInvariant() }
finally { $taskApkStream.Dispose(); $taskHash.Dispose() }
[IO.File]::WriteAllText((Join-Path (Get-Location) ($destination + '.sha256')), "$checksum  $apkName`n")
Write-Output "APK: $destination"
Write-Output "SHA-256: $checksum"
