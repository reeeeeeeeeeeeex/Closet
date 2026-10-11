param([Parameter(Mandatory=$true)][string]$Serial)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskAdb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$taskConnection = Get-Content '.test-runtime/android-connection.json' | ConvertFrom-Json
$taskLogDir = Join-Path (Get-Location) '.test-runtime/android-results'
New-Item -ItemType Directory -Force -Path $taskLogDir | Out-Null
function Invoke-Adb([string[]]$Arguments) {
    & $taskAdb -s $Serial @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'adb failed' }
}
Invoke-Adb @('install','-r','outputs/android/new-closet-1.0.0.apk')
Invoke-Adb @('install','-r','android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk')
$taskPair = Invoke-RestMethod -Uri ($taskConnection.base + '/api/sync/pairing') -Method Post -Headers @{Cookie=$taskConnection.cookie;Origin=$taskConnection.base;'X-Closet-Profile'=$taskConnection.owner}
$taskOutput = & $taskAdb -s $Serial shell am instrument -w -r -e class app.newcloset.android.ClosetInstrumentedTest -e closetAddress $taskConnection.address -e closetCode $taskPair.code app.newcloset.android.instrumentation/androidx.test.runner.AndroidJUnitRunner
$taskOutput | Set-Content (Join-Path $taskLogDir ($Serial + '-suite.txt'))
$taskOutput
if (($taskOutput -join "`n") -notmatch 'OK \(' -or ($taskOutput -join "`n") -match 'FAILURES!!!|INSTRUMENTATION_FAILED') { throw 'Android instrumentation failed' }
Invoke-Adb @('shell','am','force-stop','app.newcloset.android')
Invoke-Adb @('install','-r','outputs/android/new-closet-1.0.0.apk')
$taskUpgrade = & $taskAdb -s $Serial shell am instrument -w -r -e class 'app.newcloset.android.ClosetInstrumentedTest#verifyPreviouslySavedItem' -e checkUpgrade true app.newcloset.android.instrumentation/androidx.test.runner.AndroidJUnitRunner
$taskUpgrade | Set-Content (Join-Path $taskLogDir ($Serial + '-upgrade.txt'))
$taskUpgrade
if (($taskUpgrade -join "`n") -notmatch 'OK \(' -or ($taskUpgrade -join "`n") -match 'FAILURES!!!|INSTRUMENTATION_FAILED') { throw 'Android force-stop / upgrade verification failed' }
