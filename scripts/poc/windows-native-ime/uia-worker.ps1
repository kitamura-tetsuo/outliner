param([string]$OutputPath, [string]$Operation, [string]$Name, [string]$StateUrl = 'http://127.0.0.1:8765/state')
$ErrorActionPreference = 'Stop'
$script:Output = $OutputPath
$script:StateUrl = $StateUrl
. "$PSScriptRoot/observe.ps1"
try {
    if ($Operation -eq 'snapshot') { Snapshot-Raw $Name }
    elseif ($Operation -eq 'candidate') { Candidate-Raw $Name | Out-Null }
    elseif ($Operation -eq 'packages') {
        Get-WindowsPackage -Online | Where-Object PackageName -match 'LanguagePack' |
            Out-File "$OutputPath/language-packs.txt"
    } elseif ($Operation -eq 'capabilities') {
        $cap = Get-WindowsCapability -Online -Name 'Language.Basic~~~ja-JP~0.0.1.0'
        Save-Json 'language-capabilities-before' $cap
    } elseif ($Operation -eq 'install') {
        Save-Json 'language-install' (Add-WindowsCapability -Online -Name 'Language.Basic~~~ja-JP~0.0.1.0')
    } else { throw "Unknown operation $Operation" }
} catch { $_ | Out-String | Set-Content "$OutputPath/worker-$Name-error.txt"; exit 1 }
