function Production-Command($Path, $Body) {
    Invoke-RestMethod "http://127.0.0.1:8766/$Path" -Method Post -ContentType 'application/json; charset=utf-8' -Body (ConvertTo-Json -InputObject $Body -Depth 20 -Compress) -TimeoutSec 90
}
# End the standalone browser before WebDriver launches regular, visible Firefox.
Get-Process firefox -ErrorAction SilentlyContinue | Stop-Process -Force
$driver = Start-Process "$script:Output/geckodriver/geckodriver.exe" -ArgumentList @('--port','4444','--log','info') -PassThru -RedirectStandardOutput "$script:Output/geckodriver.stdout.txt" -RedirectStandardError "$script:Output/geckodriver.stderr.txt"
$script:AppProcesses += $driver
$bridge = Start-Process node -ArgumentList @("`"$PSScriptRoot/production-bridge.mjs`"", "`"$script:Output`"") -PassThru -RedirectStandardOutput "$script:Output/bridge.stdout.txt" -RedirectStandardError "$script:Output/bridge.stderr.txt"
$script:AppProcesses += $bridge
$deadline = [DateTime]::UtcNow.AddSeconds(60)
while (-not (Test-Path "$script:Output/production-bridge-ready.json")) {
    $bridge.Refresh(); Assert-That (-not $bridge.HasExited) 'Production browser bridge exited; inspect bridge logs'
    Assert-That ([DateTime]::UtcNow -lt $deadline) 'Production browser bridge startup timed out'
    Start-Sleep -Milliseconds 200
}
$script:StateUrl = 'http://127.0.0.1:8766/state'
$gui = Wait-FirefoxWindow
$script:FirefoxPid = $gui.Id
$script:FirefoxWindow = $gui.MainWindowHandle
[void][Native]::ShowWindow($script:FirefoxWindow,3)
[void][Native]::SetForegroundWindow($script:FirefoxWindow)
# Activate the same Microsoft TIP for the newly created browser session.
. "$PSScriptRoot/setup-ime.ps1"
$scenarioResults = @()
foreach ($count in @(1,2)) {
    foreach ($cancel in @($false,$true)) {
        $action = "production-$count-$(if ($cancel) {'cancel'} else {'confirm'})"
        Write-Host "PHASE K $action"
        [void](Production-Command 'prepare' @{action=$action})
        [void][Native]::SetForegroundWindow($script:FirefoxWindow)
        Send-Key 0x1A # direct mode during baseline placement
        $first = Production-Command 'geometry' @{text='prefixsuffix'; offset=6}
        Assert-That ([Native]::Click([int]$first.x,[int]$first.y) -eq 2) 'First item UI activation failed'
        Send-Key 0x24 # Home
        foreach ($unused in 1..6) { Send-Key 0x27 }
        $targets = @(@{itemId=$first.itemId; offset=6})
        if ($count -eq 2) {
            $second = Production-Command 'geometry' @{text='lefttail'; offset=4}
            Assert-That ([Native]::AltClick([int]$second.x,[int]$second.y) -eq 4) 'Second item Alt+Click failed'
            Start-Sleep -Milliseconds 300
            $targets += @{itemId=$second.itemId; offset=4}
        }
        $baseline = Production-Command 'baseline' @{count=$count; targets=$targets}
        Assert-That ($baseline.receiver -match 'global-textarea' -and $baseline.focused -and $baseline.documentFocused) 'App-created production receiver is not focused'
        $results.J = @{status='PROVEN'; evidence='application-revision/readiness, production authentication and before snapshots; ordinary app-created global-textarea, wrap=off, normal handlers and sizing'}
        Send-Key 0x16
        Send-Key 0xF2
        Send-Romaji 'nihon'
        $preedit = Wait-State { param($s) $s.sessionId -eq $baseline.sessionId -and $s.action -eq $action -and $s.compositionId -eq 1 -and $s.composing -and $s.focused } 'Fresh production native composition not observed'
        Save-Json "$action-preedit" $preedit
        Screen-Capture "$action-preedit"
        # Observe actual inline text and canonical preedit through the production boundary.
        foreach ($target in $targets) {
            $item = @($preedit.items | Where-Object id -eq $target.itemId)[0]
            Assert-That ($item.canonical -match '[\u3040-\u30ff]' -and $item.rendered -eq $item.canonical) 'Production inline preedit missing or not rendered'
        }
        Send-Key 0x20
        Send-Key 0x20
        $open = Require-Candidate @(Candidate "$action-open") (State)
        $initial = Selected $open
        Screen-Capture "$action-open"
        Send-Key 0x28
        $next = Require-Candidate @(Candidate "$action-navigation") (State)
        $chosen = Selected $next
        Require-Navigation $initial $chosen
        Assert-That (-not [string]::IsNullOrWhiteSpace($chosen.name)) 'Selected native text empty'
        Save-Json "$action-selected" @{candidate=$chosen; sessionId=$baseline.sessionId; action=$action; compositionId=1}
        Screen-Capture "$action-selected"
        if ($cancel) { [void](Cancel-NativeComposition $baseline) } else {
            Send-Key 0x0D
            [void](Wait-State { param($s) -not $s.composing } 'Production confirmation did not finish')
        }
        Assert-That (@(Candidate "$action-disappeared").Count -eq 0) 'Native candidate persists after production end'
        # Allow only a bounded rendering turn; strict oracle never derives C from final text.
        Start-Sleep -Milliseconds 300
        $outcome = Production-Command 'assert' @{candidate=$chosen.name; cancel=$cancel}
        Screen-Capture "$action-after"
        Snapshot "$action-after"
        [void](Production-Command 'mutations' @{candidate=$chosen.name; cancel=$cancel})
        $scenarioResults += $outcome
        Save-Json 'production-scenarios' $scenarioResults
    }
}
$results.K = @{status='PROVEN'; evidence='Four production scenarios: immutable before, native selected candidate, independently expected and canonical/rendered after; exact local cursor/selection set; live Y.Text and cursor mutation controls reject'}
