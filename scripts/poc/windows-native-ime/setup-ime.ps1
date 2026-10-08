# Supported Windows capability provisioning; changes apply only to this disposable runner.
$before = @(Get-WindowsCapability -Online | Where-Object Name -like '*~~~ja-JP~*')
Save-Json 'language-capabilities-before' $before
$basic = $before | Where-Object Name -like 'Language.Basic*'
if (-not $basic) { throw 'Windows does not advertise the Japanese basic language capability' }
if ($basic.State -ne 'Installed') {
    $change = Add-WindowsCapability -Online -Name $basic.Name
    Save-Json 'language-install' $change
    if ($change.RestartNeeded) { throw 'Japanese capability installation requires reboot; this job cannot resume an interactive login after reboot' }
}
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
Save-Json 'language-capabilities-after' @(Get-WindowsCapability -Online | Where-Object Name -like '*~~~ja-JP~*')
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
