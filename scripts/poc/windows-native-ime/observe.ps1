Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms, System.Drawing
Add-Type -Path "$PSScriptRoot/Native.cs"
function Save-Json($Name, $Object) {
    $Object | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 "$script:Output/$Name.json"
}
function Assert-That($Condition, $Message) {
    if (-not $Condition) { throw $Message }
}
function Send-Key([int]$Key) {
    $recipient = [Native]::ForegroundProfile()
    $sent = [Native]::Key($Key)
    $script:InputTrace.Add(@{time=[DateTime]::UtcNow.ToString('o'); key=$Key; count=$sent; recipient=$recipient})
    Assert-That ($sent -eq 2) "SendInput key $Key accepted $sent of 2 events"
    Start-Sleep -Milliseconds 150
}
function Send-Romaji([string]$Text) {
    foreach ($c in $Text.ToUpperInvariant().ToCharArray()) { Send-Key ([int]$c) }
}
function State { Invoke-RestMethod http://127.0.0.1:8765/state }
function Screen-Capture($Name) {
    try {
        $r = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $bmp = New-Object System.Drawing.Bitmap($r.Width, $r.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.CopyFromScreen($r.Left,$r.Top,0,0,$bmp.Size)
            $bmp.Save("$script:Output/$Name.png")
            Save-Json "$Name-capture" @{available=$true; rectangle="$r"}
        } finally { $g.Dispose(); $bmp.Dispose() }
    } catch { Save-Json "$Name-capture" @{available=$false; error="$($_.Exception)"} }
}
function Element-Record($Element) {
    $c = $Element.Current
    $selected = $null
    $p = $null
    if ($Element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$p)) {
        $selected = $p.Current.IsSelected
    }
    $process = Get-Process -Id $c.ProcessId -ErrorAction SilentlyContinue
    return @{name=$c.Name; automationId=$c.AutomationId; controlType=$c.ControlType.ProgrammaticName;
        pid=$c.ProcessId; process=$process.ProcessName; hwnd=$c.NativeWindowHandle;
        bounds="$($c.BoundingRectangle)"; offscreen=$c.IsOffscreen; selected=$selected;
        runtimeId=($Element.GetRuntimeId() -join ',')}
}
function Snapshot($Name) {
    $records = New-Object 'System.Collections.Generic.List[object]'
    $errors = New-Object 'System.Collections.Generic.List[string]'
    $queue = New-Object 'System.Collections.Generic.Queue[object]'
    $queue.Enqueue(@{element=[System.Windows.Automation.AutomationElement]::RootElement; depth=0})
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    while ($queue.Count -gt 0 -and $records.Count -lt 2500) {
        $node = $queue.Dequeue()
        try {
            $r = Element-Record $node.element
            $r.depth = $node.depth
            $records.Add($r)
            if ($node.depth -lt 16) {
                $child = $walker.GetFirstChild($node.element)
                while ($null -ne $child) {
                    $queue.Enqueue(@{element=$child; depth=$node.depth+1})
                    $child = $walker.GetNextSibling($child)
                }
            }
        } catch { $errors.Add("$($_.Exception)") }
    }
    Save-Json "uia-$Name" @{time=[DateTime]::UtcNow.ToString('o'); records=$records; errors=$errors; truncated=($queue.Count -gt 0)}
}
function Candidate($Name) {
    # A fresh desktop-wide query every time: retained UIA elements never serve as an oracle.
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::AutomationIdProperty,'IME_Candidate_Window')
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,$condition)
    $observations = @()
    foreach ($window in $windows) {
        $record = Element-Record $window
        $children = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        $record.children = @($children | ForEach-Object { Element-Record $_ })
        $record.time = [DateTime]::UtcNow.ToString('o')
        $record.foreground = [Native]::ForegroundProfile()
        $observations += $record
    }
    Save-Json "candidate-$Name" @($observations)
    return @($observations | Where-Object { -not $_.offscreen })
}
function Selected($Candidate) {
    $items = @($Candidate.children | Where-Object { $_.selected -eq $true })
    Assert-That ($items.Count -eq 1) 'UIA must expose exactly one selected candidate'
    return $items[0]
}
function Require-Candidate($Candidates, $State) {
    Assert-That ($Candidates.Count -eq 1) 'Missing or ambiguous visible native candidate window'
    $c = $Candidates[0]
    Assert-That ($c.pid -ne $script:FirefoxPid -and $c.process -match '^(TextInputHost|InputApp|ctfmon)$') 'Candidate owner is not a recognized Windows input host'
    Assert-That ($c.automationId -eq 'IME_Candidate_Window') 'Candidate AutomationId mismatch'
    Assert-That ($State.focused -and $State.documentFocused) 'Firefox textarea lost focus'
    Assert-That (($State.events | Where-Object { $_.type -eq 'compositionstart' -and $_.trusted }).Count -gt 0) 'No trusted native composition'
    $fgpid = [uint32]0
    [void][Native]::GetWindowThreadProcessId([Native]::GetForegroundWindow(),[ref]$fgpid)
    Assert-That ($fgpid -eq $script:FirefoxPid) 'Firefox is not foreground'
    return $c
}
