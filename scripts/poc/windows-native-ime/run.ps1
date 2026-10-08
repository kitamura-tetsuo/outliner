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
    Get-WindowsPackage -Online | Where-Object PackageName -match 'LanguagePack' | Out-File "$script:Output/language-packs.txt"
    $stage = 'A'
    $exe = 'C:\Program Files\Mozilla Firefox\firefox.exe'
    if (-not (Test-Path $exe)) {
        winget install --id Mozilla.Firefox --exact --silent --accept-source-agreements --accept-package-agreements 2>&1 |
            Out-File "$script:Output/firefox-install.txt"
        Assert-That ($LASTEXITCODE -eq 0 -and (Test-Path $exe)) 'Regular Firefox installation failed'
    }
    Save-Json 'firefox-version' @{path=$exe; version=(Get-Item $exe).VersionInfo; signature=(Get-AuthenticodeSignature $exe | Select-Object Status,SignerCertificate)}
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
    $firefox = Start-Process $exe -ArgumentList @('-no-remote','-profile',"`"$profile`"",'http://127.0.0.1:8765') -PassThru
    Start-Sleep -Seconds 8
    $firefox.Refresh()
    $script:FirefoxPid = $firefox.Id
    $script:FirefoxWindow = $firefox.MainWindowHandle
    Assert-That ($script:FirefoxWindow -ne [IntPtr]::Zero) 'Firefox has no GUI main window'
    [void][Native]::ShowWindow($script:FirefoxWindow,3)
    [void][Native]::SetForegroundWindow($script:FirefoxWindow)
    Snapshot 'startup'
    Screen-Capture 'startup'
    $results.A = @{status='PROVEN'; evidence='GUI HWND, uia-startup.json and startup.png'; pid=$script:FirefoxPid}
    $stage = 'C'
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($script:FirefoxWindow)
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Native IME test input')
    $editCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
    $both = New-Object System.Windows.Automation.AndCondition($condition,$editCondition)
    $input = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$both)
    Assert-That ($null -ne $input) 'Visible textarea not found in Firefox UIA tree'
    $r = $input.Current.BoundingRectangle
    Assert-That ($r.Width -gt 100 -and $r.Height -gt 100) 'Textarea has no usable GUI bounds'
    Assert-That ([Native]::Click([int]($r.Left+30),[int]($r.Top+30)) -eq 2) 'SendInput mouse focus failed'
    Start-Sleep -Seconds 1
    Send-Romaji 'abc'
    $latin = State
    Save-Json 'latin-desktop-probe' $latin
    Assert-That ($latin.focused -and $latin.documentFocused -and $latin.value -eq 'abc') 'Real desktop keyboard input did not reach focused Firefox textarea'
    Save-Json 'interactive-desktop' @{proven=$true; desktop=[Native]::InputDesktop(); foreground=[Native]::ForegroundProfile(); dpi=[Native]::GetDpiForWindow($script:FirefoxWindow); oracle='OS mouse focus and SendInput abc observed by Firefox'}
    $absent = @(Candidate 'latin')
    Assert-That ($absent.Count -eq 0) 'Negative Latin control exposed candidate window'
    Expect-Rejection 'missing-candidate' { Require-Candidate $absent $latin }
    foreach ($unused in 1..3) { Send-Key 8 }
    $stage = 'B'
    . "$PSScriptRoot/setup-ime.ps1"
    $results.B = @{status='PARTIAL'; evidence='Japanese capability and Microsoft TIP configured; activation requires trusted composition'}
    $stage = 'D'
    Send-Key 0xF2 # VK_DBE_HIRAGANA through SendInput, never Unicode insertion.
    Send-Romaji 'ni'
    $short = State
    Save-Json 'preedit-short' $short
    Assert-That (@($short.events | Where-Object { $_.type -eq 'compositionstart' -and $_.trusted }).Count -gt 0) 'Microsoft Japanese IME did not start native composition after romaji'
    Send-Romaji 'hon'
    $long = State
    Save-Json 'preedit-long' $long
    Screen-Capture 'preedit'
    Assert-That ($long.value -ne $short.value -and $long.value -match '[\u3040-\u30ff]') 'Inline preedit did not extend to Japanese characters'
    $results.C = @{status='PROVEN'; evidence='input-trace.json, trusted browser compositionstart/update following romaji SendInput'}
    $results.D = @{status='PROVEN'; evidence='preedit-short.json, preedit-long.json, preedit.png'}
    # Configuration alone is not sufficient to prove the active TSF service identity.
    $results.B = @{status='PARTIAL'; evidence='Microsoft TIP requested and Japanese composition observed; foreground HKL/profile-requested.json; exact active TSF identity still requires verification'}
    $stage = 'E'
    Send-Key 0x20
    Send-Key 0x20
    Snapshot 'candidate-open'
    Screen-Capture 'candidate-open'
    $candidates = @(Candidate 'open')
    $candidate = Require-Candidate $candidates (State)
    $results.E = @{status='PROVEN'; evidence='Fresh desktop IME_Candidate_Window in Windows input host during focused Firefox composition; candidate-open.json, candidate-open.png'}
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
    $commit = State
    Save-Json 'confirmation' $commit
    $afterConfirm = @(Candidate 'after-confirm')
    Assert-That ($afterConfirm.Count -eq 0) 'Candidate window did not disappear on confirmation'
    Expect-Rejection 'stale-candidate' { Require-Candidate $afterConfirm $commit }
    Assert-That (@($commit.events | Where-Object { $_.type -eq 'compositionend' -and $_.trusted -and $_.data -eq $commit.value }).Count -gt 0) 'No trusted composition confirmation matching committed text'
    Assert-That ($chosen.name -eq $commit.value) 'UIA selected candidate does not exactly match committed text; naming may require investigated parsing'
    $results.G = @{status='PROVEN'; evidence='candidate-open/navigation/after-confirm.json and confirmation.json; selected text equals commit'}
    $stage = 'H'
    Send-Romaji 'tokyo'
    Send-Key 0x1B
    $cancel = State
    Save-Json 'cancellation' $cancel
    Assert-That ($cancel.value -eq $commit.value -and $cancel.start -eq $commit.start -and $cancel.end -eq $commit.end) 'Cancellation failed to restore text and caret'
    Assert-That (@(Candidate 'after-cancel').Count -eq 0) 'Stale candidate remains after cancellation'
    $results.H = @{status='PROVEN'; evidence='cancellation.json restores confirmation text and selection'}
    $stage = 'I'
    # Fresh second generation prevents a captured/stale window from satisfying the oracle.
    Send-Romaji 'nihon'
    Send-Key 0x20
    Send-Key 0x20
    $new = Require-Candidate @(Candidate 'second-generation') (State)
    Send-Key 0x1B
    Send-Key 0x1B
    Assert-That (@(Candidate 'second-disappeared').Count -eq 0) 'Candidate did not disappear after second composition'
    $results.I = @{status='PARTIAL'; evidence='Latin absence and second generation disappearance verified; adversarial oracle checks in controls.ps1; full direct-input restore control still required'}
    $results.J = @{status='BLOCKED'; evidence='Existing service bootstrap is Linux-specific; standalone only. No production textarea run.'}
    $results.K = @{status='BLOCKED'; evidence='No production Yjs document/cursor observation; REQ-005 is not verified.'}
} catch {
    $results[$stage] = @{status='FAILED'; evidence="$($_.Exception.Message)"}
    $_ | Out-String | Set-Content "$script:Output/failure.txt"
    try { Snapshot 'failure'; Screen-Capture 'failure' } catch { $_ | Out-String | Set-Content "$script:Output/diagnostic-failure.txt" }
} finally {
    if (Get-Command Save-Json -ErrorAction SilentlyContinue) {
        Save-Json 'input-trace' $script:InputTrace
        Save-Json 'results' @{capabilities=$results; sha=$env:GITHUB_SHA; run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"}
    }
    if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    if ($firefox) { Stop-Process -Id $firefox.Id -ErrorAction SilentlyContinue }
    Stop-Transcript
}
# A standalone success cannot make the complete PoC green: all A-K are required.
if (@($results.Values | Where-Object status -ne 'PROVEN').Count -gt 0) { exit 1 }
