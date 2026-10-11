# Supported Windows capability provisioning; changes apply only to this disposable runner.
# Inspect one named capability in an isolated process; servicing inventory may hang.
try {
    Invoke-UIAProbe 'capabilities' 'japanese-capability'
    $script:JapaneseCapability = Get-Content -Raw "$script:Output/language-capabilities-before.json" | ConvertFrom-Json
} catch {
    Save-Json 'language-capability-query-error' @{error="$($_.Exception.Message)"}
    $script:JapaneseCapability = $null
}
# Registration/configuration is attempted independently. Only native composition can prove usability.
$list = Get-WinUserLanguageList
if (-not ($list.LanguageTag -contains 'ja-JP')) { $list.Add('ja-JP') }
$japanese = $list | Where-Object LanguageTag -eq 'ja-JP'
# Published Microsoft Japanese TSF TIP and profile, not a locale/culture change.
$tip = '0411:{03B5835F-F03C-411B-9CE2-AA23E1171E36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}'
$japanese.InputMethodTips.Clear()
$japanese.InputMethodTips.Add($tip)
Set-WinUserLanguageList $list -Force
Set-WinDefaultInputMethodOverride -InputTip $tip
Save-Json 'language-list-after' @(Get-WinUserLanguageList)
Save-Json 'default-input-after' (Get-WinDefaultInputMethodOverride)
Save-Json 'language-registration-note' @{capability=$script:JapaneseCapability; activationNotYetProven=$true; method='Set-WinUserLanguageList + Microsoft TIP + foreground keyboard profile request'}
$paths = @('HKLM:\SOFTWARE\Microsoft\CTF\TIP\{03B5835F-F03C-411B-9CE2-AA23E1171E36}',
    'HKCU:\SOFTWARE\Microsoft\CTF\TIP\{03B5835F-F03C-411B-9CE2-AA23E1171E36}')
foreach ($path in $paths) {
    if (Test-Path $path) {
        Get-ChildItem $path -Recurse | ForEach-Object { Get-ItemProperty $_.PSPath } |
            Out-File -Append "$script:Output/microsoft-japanese-tsf-registry.txt"
    }
}
$layout = [Native]::LoadKeyboardLayout('00000411',1)
Assert-That ($layout -ne [IntPtr]::Zero) 'Japanese keyboard layout could not be loaded'
# This requests a keyboard profile change only; actual IME composition is checked separately.
[void][Native]::PostMessage($script:FirefoxWindow,0x50,[IntPtr]::Zero,$layout)
Start-Sleep -Seconds 2
Save-Json 'profile-requested' @{tip=$tip; requestedHkl=$layout.ToInt64().ToString('X'); foreground=[Native]::ForegroundProfile()}

try {
    $script:TsfObservation = [JapaneseTsf]::ActivateSession()
    Save-Json 'active-tsf-session' @{observation=$script:TsfObservation; callerSession=(Get-Process -Id $PID).SessionId; scope='Session activation; native Firefox composition still required'}
} catch {
    $script:TsfObservation = "ERROR: $($_.Exception.Message)"
    Save-Json 'active-tsf-session-error' @{error=$script:TsfObservation}
}
Save-Json 'profile-after-tsf' @{foreground=[Native]::ForegroundProfile(); tsf=$script:TsfObservation}

function Install-JapaneseBasic {
    Write-Host 'Attempt supported Japanese basic capability installation after failed native activation'
    Invoke-UIAProbe 'install' 'japanese-install' 300
    $change = Get-Content -Raw "$script:Output/language-install.json" | ConvertFrom-Json
    if ($change.RestartNeeded) { throw 'Japanese installation requires reboot; hosted job cannot resume interactive login after reboot' }
}
