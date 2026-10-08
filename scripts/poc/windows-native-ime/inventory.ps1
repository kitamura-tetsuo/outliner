$ErrorActionPreference = 'Stop'
$target = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force $target | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Path "$PSScriptRoot/Native.cs"
$inventory = @{
    os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber)
    imageOS=$env:ImageOS
    imageVersion=$env:ImageVersion
    session=(Get-Process -Id $PID).SessionId
    inputDesktop=[Native]::InputDesktop()
    foreground=[Native]::ForegroundProfile()
    screens=@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.Bounds) primary=$($_.Primary)" })
    languages=@(Get-WinUserLanguageList)
    defaultInput=(Get-WinDefaultInputMethodOverride)
    firefoxVersion=(Get-Item 'C:\Program Files\Mozilla Firefox\firefox.exe' -ErrorAction SilentlyContinue).VersionInfo.FileVersion
    sha=$env:GITHUB_SHA
    run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"
}
$inventory | ConvertTo-Json -Depth 15 | Set-Content -Encoding UTF8 "$target/inventory.json"
$inventory | ConvertTo-Json -Depth 15 | Write-Host
$tipPath = 'HKLM:\SOFTWARE\Microsoft\CTF\TIP\{03B5835F-F03C-411B-9CE2-AA23E1171E36}'
if (Test-Path $tipPath) {
    Get-ChildItem $tipPath -Recurse | ForEach-Object { Get-ItemProperty $_.PSPath } |
        Out-File "$target/tsf-before.txt"
} else { 'Microsoft Japanese TIP registry key absent' | Set-Content "$target/tsf-before.txt" }
