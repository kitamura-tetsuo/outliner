$ErrorActionPreference = 'Stop'
$script:Output = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force $script:Output | Out-Null
. "$PSScriptRoot/observe.ps1"
$script:InputTrace = New-Object 'System.Collections.Generic.List[object]'
$server = $null
$browser = $null
$passed = $false
try {
    $exe = 'C:\Program Files\Mozilla Firefox\firefox.exe'
    Assert-That (Test-Path $exe) 'Regular Firefox missing'
    $profile = Join-Path $script:Output 'transport-profile'
    New-Item -ItemType Directory -Force $profile | Out-Null
    'user_pref("browser.aboutwelcome.enabled", false);' | Set-Content "$profile/user.js"
    Write-Host 'TRANSPORT launching fixture server'
    $server = Start-Process node -ArgumentList @("`"$PSScriptRoot/server.mjs`"","`"$script:Output`"") -PassThru -RedirectStandardOutput "$script:Output/server.log" -RedirectStandardError "$script:Output/server-error.log"
    Write-Host 'TRANSPORT launching GUI Firefox'
    $browser = Start-Process $exe -ArgumentList @('-no-remote','-profile',"`"$profile`"",'http://127.0.0.1:8765') -PassThru -RedirectStandardOutput "$script:Output/firefox-stdout.log" -RedirectStandardError "$script:Output/firefox-stderr.log"
    Start-Sleep -Seconds 8
    $browser.Refresh()
    # Firefox may use a launcher process; find the actual window rather than assuming its PID.
    $windows = @(Get-Process firefox | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
    Assert-That ($windows.Count -eq 1) 'Expected exactly one Firefox GUI window on this disposable runner'
    $window = $windows[0].MainWindowHandle
    $script:FirefoxPid = $windows[0].Id
    [void][Native]::SetForegroundWindow($window)
    Start-Sleep -Seconds 1
    $geometry = State
    Save-Json 'transport-geometry' $geometry
    Assert-That ($geometry.rect.width -gt 100 -and $null -ne $geometry.window.innerScreenX) 'Firefox fixture geometry unavailable'
    $x = [int](($geometry.window.innerScreenX + $geometry.rect.left + 30) * $geometry.screen.dpr)
    $y = [int](($geometry.window.innerScreenY + $geometry.rect.top + 30) * $geometry.screen.dpr)
    $mouseCount = [Native]::Click($x,$y)
    Save-Json 'transport-mouse' @{x=$x;y=$y;accepted=$mouseCount;desktop=[Native]::InputDesktop()}
    Assert-That ($mouseCount -eq 2) 'SendInput mouse rejected'
    Send-Romaji 'abc'
    $state = State
    $fgpid = [uint32]0
    [void][Native]::GetWindowThreadProcessId([Native]::GetForegroundWindow(),[ref]$fgpid)
    Save-Json 'transport-state' $state
    Save-Json 'transport-observation' @{firefoxPid=$script:FirefoxPid;foregroundPid=$fgpid;profile=[Native]::ForegroundProfile();dpi=[Native]::GetDpiForWindow($window)}
    Screen-Capture 'transport'
    Assert-That ($fgpid -eq $script:FirefoxPid -and $state.focused -and $state.documentFocused -and $state.value -eq 'abc') 'OS keyboard input did not reach the foreground Firefox textarea'
    Assert-That (@($state.events | Where-Object { $_.type -eq 'input' -and $_.trusted }).Count -gt 0) 'No trusted keyboard input evidence'
    $passed = $true
} catch {
    Write-Host "TRANSPORT FAILURE: $($_.Exception.Message)"
    $_ | Out-String | Set-Content "$script:Output/transport-failure.txt"
    Screen-Capture 'transport-failure'
} finally {
    Save-Json 'input-trace' $script:InputTrace
    Save-Json 'results' @{transportProven=$passed;nativeImeProven=$false;sha=$env:GITHUB_SHA;run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"}
    if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    # This script explicitly targets a disposable hosted runner and owns its sole Firefox window.
    Get-Process firefox -ErrorAction SilentlyContinue | Stop-Process -ErrorAction SilentlyContinue
}
if (-not $passed) { exit 1 }
