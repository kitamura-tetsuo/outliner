$ErrorActionPreference = 'Stop'
$script:Output = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force $script:Output | Out-Null
Start-Transcript -Path "$script:Output/transcript.txt"
$script:InputTrace = New-Object 'System.Collections.Generic.List[object]'
$results = [ordered]@{}
foreach ($id in 'A','B','C','D','E','F','G','H','I','J','K') {
    $results[$id] = @{status='BLOCKED'; evidence='Not reached; see failure and predecessor evidence'}
}
$server = $null
$firefox = $null
$stage = 'environment'
Write-Host 'PHASE environment: inspecting Windows session and packages'
try {
    . "$PSScriptRoot/observe.ps1"
    . "$PSScriptRoot/controls.ps1"
    Save-Json 'environment' @{os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber);
        imageOS=$env:ImageOS; imageVersion=$env:ImageVersion; runner=$env:RUNNER_NAME;
        sha=$env:GITHUB_SHA; run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID";
        session=(Get-Process -Id $PID).SessionId; inputDesktop=[Native]::InputDesktop();
        screens=@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.Bounds) primary=$($_.Primary)" });
        languageList=@(Get-WinUserLanguageList); defaultInput=(Get-WinDefaultInputMethodOverride)}
    query session 2>&1 | Out-File "$script:Output/sessions.txt"
    reg query 'HKLM\SYSTEM\CurrentControlSet\Control\Keyboard Layouts' /s 2>&1 | Out-File "$script:Output/keyboard-layouts.txt"
    reg query 'HKCU\Keyboard Layout' /s 2>&1 | Out-File "$script:Output/user-keyboards.txt"
    Get-WinSystemLocale | Out-File "$script:Output/system-locale.txt"
    try { Invoke-UIAProbe 'packages' 'language-packs' } catch { Save-Json 'language-packs-error' @{error="$($_.Exception.Message)"} }
    Write-Host 'PHASE A: launching regular Firefox GUI'
    $stage = 'A'
    $exe = 'C:\Program Files\Mozilla Firefox\firefox.exe'
    if (-not (Test-Path $exe)) {
        winget install --id Mozilla.Firefox --exact --silent --accept-source-agreements --accept-package-agreements 2>&1 |
            Out-File "$script:Output/firefox-install.txt"
        Assert-That ($LASTEXITCODE -eq 0 -and (Test-Path $exe)) 'Regular Firefox installation failed'
    }
    Save-Json 'firefox-version' @{path=$exe; version=(Get-Item $exe).VersionInfo; distribution='Regular desktop Firefox preinstalled in hosted runner image (or recorded winget installation)'}
    $profile = Join-Path $script:Output 'firefox-profile'
    New-Item -ItemType Directory -Force $profile | Out-Null
    @'
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("accessibility.force_disabled", -1);
'@ | Set-Content "$profile/user.js"
    $server = Start-Process node -ArgumentList @("`"$PSScriptRoot/server.mjs`"","`"$script:Output`"") -PassThru -RedirectStandardOutput "$script:Output/server.log" -RedirectStandardError "$script:Output/server-error.log"
    $env:MOZ_LOG = 'timestamp,IMEHandler:5,TextInput:5'
    $env:MOZ_LOG_FILE = "$script:Output/firefox-ime.log"
    $firefox = Start-Process $exe -ArgumentList @('-no-remote','-profile',"`"$profile`"",'http://127.0.0.1:8765') -PassThru -RedirectStandardOutput "$script:Output/firefox-stdout.log" -RedirectStandardError "$script:Output/firefox-stderr.log"
    $gui = Wait-FirefoxWindow
    $script:FirefoxPid = $gui.Id
    $script:FirefoxWindow = $gui.MainWindowHandle
    Assert-That ($script:FirefoxWindow -ne [IntPtr]::Zero) 'Firefox has no GUI main window'
    [void][Native]::ShowWindow($script:FirefoxWindow,3)
    [void][Native]::SetForegroundWindow($script:FirefoxWindow)
    try { Snapshot 'startup' } catch { Save-Json 'uia-startup-error' @{error="$($_.Exception.Message)"} }
    Screen-Capture 'startup'
    $results.A = @{status='PROVEN'; evidence='GUI HWND and uia-startup.json; startup-capture.json separately records capture capability'; pid=$script:FirefoxPid}
    Save-Json 'results' @{capabilities=$results; sha=$env:GITHUB_SHA; run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"}
    Write-Host 'PHASE C: locating UIA textarea and testing SendInput delivery'
    $stage = 'C'
    # Read-only browser geometry locates the real visible fixture; OS mouse input performs focus.
    $geometry = Wait-State { param($s) $null -ne $s.window.innerScreenX -and $s.rect.width -gt 100 } 'Firefox fixture did not load within 30 seconds' 30
    Assert-That ($null -ne $geometry.window.innerScreenX -and $geometry.rect.width -gt 100) 'Firefox did not expose fixture geometry'
    $clickX = [int](($geometry.window.innerScreenX + $geometry.rect.left + 30) * $geometry.screen.dpr)
    $clickY = [int](($geometry.window.innerScreenY + $geometry.rect.top + 30) * $geometry.screen.dpr)
    Save-Json 'gui-click' @{x=$clickX; y=$clickY; geometry=$geometry}
    Assert-That ([Native]::Click($clickX,$clickY) -eq 2) 'SendInput mouse focus failed'
    Start-Sleep -Seconds 1
    Send-Romaji 'abc'
    $latin = Wait-State { param($s) $s.value -eq 'abc' -and $s.focused -and $s.documentFocused } 'Latin SendInput did not reach Firefox within 10 seconds'
    Save-Json 'latin-desktop-probe' $latin
    Assert-That ($latin.focused -and $latin.documentFocused -and $latin.value -eq 'abc') 'Real desktop keyboard input did not reach focused Firefox textarea'
    Save-Json 'interactive-desktop' @{proven=$true; desktop=[Native]::InputDesktop(); foreground=[Native]::ForegroundProfile(); dpi=[Native]::GetDpiForWindow($script:FirefoxWindow); oracle='OS mouse focus and SendInput abc observed by Firefox'}
    $latinControlsProven = $false
    try {
        $absent = @(Candidate 'latin')
        Expect-Rejection 'direct-latin' { Require-Candidate $absent $latin }
        Expect-Rejection 'missing-candidate' { Require-Candidate @() $latin }
        $latinControlsProven = $true
    } catch {
        Save-Json 'negative-latin-uia-error' @{error="$($_.Exception.Message)"}
        $results.I = @{status='FAILED'; evidence='Negative Latin UIA query failed; never treated as candidate absence'}
    }
    foreach ($unused in 1..3) { Send-Key 8 }
    Write-Host 'PHASE B: provisioning Microsoft Japanese IME'
    $stage = 'B'
    Save-Json 'input-trace' $script:InputTrace
    . "$PSScriptRoot/setup-ime.ps1"
    $results.B = @{status='PARTIAL'; evidence='Japanese capability and Microsoft TIP configured; activation requires trusted composition'}
    Write-Host 'PHASE D: testing real Japanese preedit'
    $stage = 'D'
    Send-Key 0x16 # VK_IME_ON
    Send-Key 0xF2 # VK_DBE_HIRAGANA through SendInput, never Unicode insertion.
    Send-Romaji 'ni'
    try {
        $short = Wait-State { param($s) $s.composing -and $s.value -match '[\u3040-\u30ff]' } 'Japanese native preedit did not appear within 10 seconds'
    } catch {
        Save-Json 'initial-ime-activation-error' @{error="$($_.Exception.Message)"}
        Install-JapaneseBasic
        . "$PSScriptRoot/setup-ime.ps1"
        # OS editing and mode keys only; no committed Unicode substitution.
        foreach ($unused in 1..2) { Send-Key 8 }
        Send-Key 0x16 # VK_IME_ON
        Send-Key 0xF2
        Send-Romaji 'ni'
        $short = Wait-State { param($s) $s.composing -and $s.value -match '[\u3040-\u30ff]' } 'Native Japanese preedit failed after supported capability installation'
    }
    Save-Json 'preedit-short' $short
    Assert-That (@($short.events | Where-Object { $_.type -eq 'compositionstart' -and $_.trusted }).Count -gt 0) 'Microsoft Japanese IME did not start native composition after romaji'
    Send-Romaji 'hon'
    $long = Wait-State { param($s) $s.composing -and $s.value -ne $short.value } 'Japanese preedit did not extend within 10 seconds'
    Save-Json 'preedit-long' $long
    Screen-Capture 'preedit'
    Assert-That ($long.value -ne $short.value -and $long.value -match '[\u3040-\u30ff]') 'Inline preedit did not extend to Japanese characters'
    $results.C = @{status='PROVEN'; evidence='input-trace.json, trusted browser compositionstart/update following romaji SendInput'}
    $results.D = @{status='PROVEN'; evidence='preedit-short.json, preedit-long.json, preedit.png'}
    # Configuration alone is not sufficient to prove the active TSF service identity.
    $results.B = @{status='PARTIAL'; evidence='Microsoft TIP requested and Japanese composition observed; see active-tsf-session.json and foreground profile'}
    if ($script:TsfObservation -match 'activeMicrosoft=True') {
        $results.B = @{status='PROVEN'; evidence='Microsoft Japanese CLSID/profile returned by live TSF manager after session activation; trusted Firefox Japanese composition; active-tsf-session.json'}
    }
    Write-Host 'PHASE E: querying native desktop candidate UI'
    $stage = 'E'
    Send-Key 0x20
    Send-Key 0x20
    Snapshot 'candidate-open'
    Screen-Capture 'candidate-open'
    $candidates = @(Candidate 'open')
    $candidate = Require-Candidate $candidates (State)
    $results.E = @{status='PROVEN'; evidence="Fresh desktop native candidate during focused Firefox composition: class=$($candidate.windowClass), name=$($candidate.name), pid=$($candidate.pid), hwnd=$($candidate.hwnd); candidate-open.json/png"}
    $stage = 'F'
    $initial = Selected $candidate
    $results.F = @{status='PROVEN'; evidence='candidate-open.json exposes native selected item and candidate contents'}
    $stage = 'G'
    Send-Key 0x28
    $next = Require-Candidate @(Candidate 'navigation') (State)
    $chosen = Selected $next
    Expect-Rejection 'unchanged-selection' { Require-Navigation $initial $initial }
    Require-Navigation $initial $chosen
    Assert-That (-not [string]::IsNullOrWhiteSpace($chosen.name)) 'Selected candidate text is empty'
    Send-Key 0x0D
    $commit = Wait-State { param($s) -not $s.composing } 'Composition confirmation did not finish within 10 seconds'
    Save-Json 'confirmation' $commit
    $afterConfirm = @(Candidate 'after-confirm')
    Assert-That ($afterConfirm.Count -eq 0) 'Candidate window did not disappear on confirmation'
    Expect-Rejection 'stale-candidate' { Require-Candidate $afterConfirm $commit }
    Expect-Rejection 'captured-after-disappearance' { Require-Candidate @($candidate) $commit }
    Expect-Rejection 'committed-unicode-only' { Require-Candidate @($candidate) $commit }
    Assert-That (@($commit.events | Where-Object { $_.type -eq 'compositionend' -and $_.trusted -and $_.data -eq $commit.value }).Count -gt 0) 'No trusted composition confirmation matching committed text'
    Assert-That ($chosen.name -eq $commit.value) 'UIA selected candidate does not exactly match committed text; naming may require investigated parsing'
    $results.G = @{status='PROVEN'; evidence='candidate-open/navigation/after-confirm.json and confirmation.json; selected text equals commit'}
    $stage = 'H'
    Send-Romaji 'tokyo'
    $cancel = Cancel-NativeComposition $commit
    Save-Json 'cancellation' $cancel
    Assert-That ($cancel.value -eq $commit.value -and $cancel.start -eq $commit.start -and $cancel.end -eq $commit.end) 'Cancellation failed to restore text and caret'
    Assert-That (@(Candidate 'after-cancel').Count -eq 0) 'Stale candidate remains after cancellation'
    $results.H = @{status='PROVEN'; evidence='cancellation.json restores confirmation text and selection'}
    $stage = 'I'
    Assert-That $latinControlsProven 'Initial Latin/missing-window controls did not pass'
    Send-Key 0x1A # VK_IME_OFF: explicitly switch the same textarea back to direct Latin input.
    Send-Romaji 'abc'
    $direct = Wait-State { param($s) -not $s.composing -and $s.value -eq ($commit.value + 'abc') } 'Direct Latin control did not produce uncomposed abc'
    Save-Json 'control-direct-latin-state' $direct
    $directCandidates = @(Candidate 'direct-latin-restored')
    Expect-Rejection 'direct-latin-after-japanese' { Require-Candidate $directCandidates $direct }
    foreach ($unused in 1..3) { Send-Key 8 }
    Send-Key 0x16
    Send-Key 0xF2
    # Fresh second generation prevents a captured/stale window from satisfying the oracle.
    Send-Romaji 'nihon'
    Send-Key 0x20
    Send-Key 0x20
    $secondState = State
    Expect-Rejection 'old-generation' { Require-Candidate @($candidate) $secondState }
    $new = Require-Candidate @(Candidate 'second-generation') $secondState
    [void](Cancel-NativeComposition $commit)
    Assert-That (@(Candidate 'second-disappeared').Count -eq 0) 'Candidate did not disappear after second composition'
    $results.I = @{status='PROVEN'; evidence='Actual Latin mode/input rejects candidate assertion, restored Japanese opens native candidate, missing/unchanged/stale/old-generation controls reject; UIA worker errors throw rather than pass'}
    $stage = 'J'
    Write-Host 'PHASE J: attempting existing Outliner service bootstrap on Windows'
    $bash = 'C:\Program Files\Git\bin\bash.exe'
    Save-Json 'integration-preflight' @{bashAvailable=(Test-Path $bash); serverBuildAvailable=(Test-Path 'server/dist/server/src/index.js'); rootDependenciesAvailable=(Test-Path 'node_modules'); clientDependenciesAvailable=(Test-Path 'client/node_modules'); startup='scripts/ci-e2e-start.sh'; boundary='Use existing bootstrap only; no complete infrastructure migration'}
    if (Test-Path $bash) {
        $startup = Start-Process $bash -ArgumentList @('-lc','"bash scripts/ci-e2e-start.sh"') -WorkingDirectory (Get-Location).Path -PassThru -RedirectStandardOutput "$script:Output/integration-startup-stdout.txt" -RedirectStandardError "$script:Output/integration-startup-stderr.txt"
        try {
            [void]$startup.Handle
            $finished = $startup.WaitForExit(60000)
            if (-not $finished) { taskkill /PID $startup.Id /T /F | Out-Null }
            $startup.Refresh()
            Save-Json 'integration-startup' @{finished=$finished; exitCode=$startup.ExitCode; timeoutSeconds=60}
            Get-Content "$script:Output/integration-startup-stdout.txt","$script:Output/integration-startup-stderr.txt" | Select-Object -Last 35 | Write-Host
        } finally { $startup.Dispose() }
    }
    $results.J = @{status='BLOCKED'; evidence='Existing service bootstrap attempted without Ubuntu dependencies or infrastructure migration; see integration-preflight/startup and logs. No ready production textarea path established.'}
    $results.K = @{status='BLOCKED'; evidence='No production Yjs document/cursor observation; REQ-005 is not verified.'}
} catch {
    Write-Host "PROBE FAILURE at $stage : $($_.Exception.Message)"
    $results[$stage] = @{status='FAILED'; evidence="$($_.Exception.Message)"}
    $_ | Out-String | Set-Content "$script:Output/failure.txt"
    Screen-Capture 'failure'
    try { Snapshot 'failure' } catch { $_ | Out-String | Set-Content "$script:Output/diagnostic-failure.txt" }
    # Independent native cancellation remains testable when selected-item UIA is unavailable.
    # These observations never promote unobserved candidate selection to PROVEN.
    if ($results.D.status -eq 'PROVEN' -and $stage -in @('E','F')) {
        try {
            Send-Key 0x28
            $navigated = State
            Save-Json 'candidate-unverified-navigation' $navigated
            Send-Key 0x0D
            $confirmed = Wait-State { param($s) -not $s.composing } 'Supplemental native confirmation did not finish'
            Save-Json 'confirmation' $confirmed
            $results.G = @{status='PARTIAL'; evidence='Native Down/Enter and trusted composition confirmation recorded, but selected native text is not observed'}
            Send-Romaji 'ni'
            $cancelPreedit = Wait-State { param($s) $s.composing -and $s.compositionId -gt $confirmed.compositionId } 'Independent cancellation preedit did not start'
            $cancelled = Cancel-NativeComposition $confirmed
            Assert-That ($cancelled.start -eq $confirmed.start -and $cancelled.end -eq $confirmed.end) 'Independent cancellation did not restore caret'
            Assert-That (@($cancelled.events | Where-Object { $_.type -eq 'compositionend' -and $_.trusted }).Count -gt 0) 'Cancellation lacks trusted compositionend'
            Save-Json 'cancellation' @{before=$confirmed; preedit=$cancelPreedit; after=$cancelled}
            Screen-Capture 'candidate-cancelled'
            $results.H = @{status='PROVEN'; evidence='Independent real native composition/Escape restores committed value and exact textarea caret; cancellation.json'}
        } catch { Save-Json 'supplemental-native-error' @{error="$($_.Exception.Message)"} }
    }
} finally {
    if (Get-Command Save-Json -ErrorAction SilentlyContinue) {
        Save-Json 'input-trace' $script:InputTrace
        Save-Json 'results' @{capabilities=$results; sha=$env:GITHUB_SHA; run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"}
    }
    if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    if ($firefox) {
        $browserProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'firefox.exe' -and ($_.CommandLine -like "*$profile*" -or $_.ParentProcessId -eq $firefox.Id) })
        foreach ($browserProcess in $browserProcesses) { Stop-Process -Id $browserProcess.ProcessId -ErrorAction SilentlyContinue }
        Stop-Process -Id $firefox.Id -ErrorAction SilentlyContinue
    }
    Stop-Transcript
}
# A standalone success cannot make the complete PoC green: all A-K are required.
if (@($results.Values | Where-Object status -ne 'PROVEN').Count -gt 0) { exit 1 }
