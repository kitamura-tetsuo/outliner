param([string]$OutputPath, [string]$Operation, [string]$Name)
$ErrorActionPreference = 'Stop'
$script:Output = $OutputPath
. "$PSScriptRoot/observe.ps1"
try {
    if ($Operation -eq 'snapshot') { Snapshot-Raw $Name }
    elseif ($Operation -eq 'candidate') { Candidate-Raw $Name | Out-Null }
    elseif ($Operation -eq 'packages') {
        Get-WindowsPackage -Online | Where-Object PackageName -match 'LanguagePack' |
            Out-File "$OutputPath/language-packs.txt"
    } else { throw "Unknown operation $Operation" }
} catch { $_ | Out-String | Set-Content "$OutputPath/worker-$Name-error.txt"; exit 1 }
