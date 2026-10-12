function Expect-Rejection($Name, [scriptblock]$Action) {
    $rejected = $false
    $reason = ''
    try { & $Action | Out-Null } catch { $rejected = $true; $reason = $_.Exception.Message }
    Save-Json "control-$Name" @{rejected=$rejected; reason=$reason}
    Assert-That $rejected "Negative control $Name unexpectedly passed"
}
function Require-Navigation($Before, $After) {
    Assert-That ($After.runtimeId -ne $Before.runtimeId -and $After.name -ne $Before.name) 'Unchanged selection cannot count as navigation'
}
