Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms, System.Drawing
Add-Type -Path "$PSScriptRoot/Native.cs"
Add-Type -AssemblyName Accessibility
function Save-Json($Name, $Object) {
    $json = ConvertTo-Json -InputObject $Object -Depth 30
    $json | Set-Content -Encoding UTF8 "$script:Output/$Name.json"
    if ($Name -in @('results','environment','language-install','profile-requested') -or $Name -like '*-capture' -or $Name -like '*-error' -or $Name -like 'integration-*' -or $Name -like 'transport-*' -or $Name -eq 'input-trace' -or $Name -like 'active-tsf*' -or $Name -like 'language-*' -or $Name -like 'default-input*' -or $Name -like 'candidate-*' -or $Name -like 'control-*' -or $Name -eq 'wait-state-failure' -or $Name -like 'preedit-*' -or $Name -in @('confirmation','cancellation')) {
        Write-Host "EVIDENCE $Name $json"
    }
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
function State { Invoke-RestMethod http://127.0.0.1:8765/state -TimeoutSec 3 }
function Cancel-NativeComposition($Baseline) {
    # Conversion cancellation can first restore the reading, then clear it, then end composition.
    for ($attempt=0; $attempt -lt 6; $attempt++) {
        $observed = State
        if (-not $observed.composing) {
            Assert-That ($observed.value -eq $Baseline.value) 'Native cancellation ended with different text'
            return $observed
        }
        Send-Key 0x1B
        Start-Sleep -Milliseconds 200
    }
    return Wait-State { param($s) -not $s.composing -and $s.value -eq $Baseline.value } 'Native cancellation did not restore committed text'
}
function Wait-State([scriptblock]$Predicate, [string]$Message, [int]$TimeoutSeconds=10) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $observed = State
        if (& $Predicate $observed) { return $observed }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    Save-Json 'wait-state-failure' $observed
    throw $Message
}
function Wait-FirefoxWindow {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $windows = @(Get-Process firefox -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
        if ($windows.Count -eq 1) { return $windows[0] }
        Assert-That ($windows.Count -le 1) 'Ambiguous Firefox GUI windows on disposable runner'
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Firefox GUI window did not appear within 30 seconds'
}
function Screen-Capture($Name) {
    try {
        $r = [System.Windows.Forms.SystemInformation]::VirtualScreen
        $bmp = New-Object System.Drawing.Bitmap($r.Width, $r.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.CopyFromScreen($r.Left,$r.Top,0,0,$bmp.Size)
            $bmp.Save("$script:Output/$Name.png")
            if ($Name -like 'transport*' -or $Name -eq 'failure' -or $Name -like 'candidate*' -or $Name -eq 'preedit') {
                Write-Host "SCREENSHOT64 $Name $([Convert]::ToBase64String([IO.File]::ReadAllBytes("$script:Output/$Name.png")))"
            }
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
    $windowClass = [Native]::WindowClass($c.NativeWindowHandle)
    $bounds = @{left=$c.BoundingRectangle.Left;top=$c.BoundingRectangle.Top;width=$c.BoundingRectangle.Width;height=$c.BoundingRectangle.Height}
    foreach ($key in @('left','top','width','height')) {
        if ([double]::IsInfinity($bounds[$key]) -or [double]::IsNaN($bounds[$key])) { $bounds[$key] = $null }
    }
    $legacy = $null
    if ($windowClass -eq 'mscandui40.candidate') {
        try {
            $accessible = [Accessibility.IAccessible][Native]::AccessibleClient($c.NativeWindowHandle)
            $items = @()
            for ($childId=1; $childId -le $accessible.accChildCount; $childId++) {
                $state = [int]$accessible.get_accState($childId)
                $items += @{name=$accessible.get_accName($childId); selected=(($state -band 2) -ne 0); state=$state; childId=$childId; runtimeId="hwnd=$($c.NativeWindowHandle),msaa=$childId"}
            }
            $legacy = @{name=$accessible.get_accName(0); role=$accessible.get_accRole(0); state=$accessible.get_accState(0); childCount=$accessible.accChildCount; items=$items; source='Native HWND OBJID_CLIENT IAccessible'}
        } catch { $legacy = @{error="$($_.Exception.Message)"; source='Native HWND OBJID_CLIENT IAccessible'} }
    }
    return @{name=$c.Name; automationId=$c.AutomationId; controlType=$c.ControlType.ProgrammaticName;
        windowClass=$windowClass; legacy=$legacy; supportedPatterns=@($Element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName });
        pid=$c.ProcessId; process=$process.ProcessName; hwnd=$c.NativeWindowHandle;
        bounds=$bounds; offscreen=$c.IsOffscreen; selected=$selected;
        runtimeId=($Element.GetRuntimeId() -join ',')}
}
function Snapshot-Raw($Name) {
    $records = New-Object 'System.Collections.Generic.List[object]'
    $errors = New-Object 'System.Collections.Generic.List[string]'
    $queue = New-Object 'System.Collections.Generic.Queue[object]'
    $queue.Enqueue(@{element=[System.Windows.Automation.AutomationElement]::RootElement; depth=0})
    $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
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
function Candidate-Raw($Name) {
    $before = State
    # A fresh desktop-wide query every time: retained UIA elements never serve as an oracle.
    $published = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::AutomationIdProperty,'IME_Candidate_Window')
    $classic = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty,'Microsoft Candidate UI')
    $condition = New-Object System.Windows.Automation.OrCondition($published,$classic)
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,$condition)
    $observations = @()
    foreach ($window in $windows) {
        $record = Element-Record $window
        $children = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        $record.children = @($children | ForEach-Object { Element-Record $_ })
        $record.time = [DateTime]::UtcNow.ToString('o')
        $record.compositionId = $before.compositionId
        $record.composingBefore = $before.composing
        $record.foreground = [Native]::ForegroundProfile()
        $observations += $record
    }
    Save-Json "candidate-$Name" @($observations)
    return @($observations | Where-Object { -not $_.offscreen })
}
function Selected($Candidate) {
    $items = @($Candidate.children | Where-Object { $_.selected -eq $true })
    if ($items.Count -eq 0 -and $null -ne $Candidate.legacy.items) {
        $items = @($Candidate.legacy.items | Where-Object { $_.selected -eq $true })
    }
    Assert-That ($items.Count -eq 1) 'UIA must expose exactly one selected candidate'
    return $items[0]
}
function Require-Candidate($Candidates, $State) {
    Assert-That ($Candidates.Count -eq 1) 'Missing or ambiguous visible native candidate window'
    $c = $Candidates[0]
    $modern = $c.automationId -eq 'IME_Candidate_Window' -and $c.pid -ne $script:FirefoxPid -and $c.process -match '^(TextInputHost|InputApp|ctfmon)$'
    $classic = $c.name -eq 'Microsoft Candidate UI' -and $c.hwnd -ne 0 -and $c.pid -eq $script:FirefoxPid -and $c.windowClass -eq 'mscandui40.candidate'
    Assert-That ($modern -or $classic) 'Candidate owner/class is not an established Windows IME host or native Microsoft Candidate UI HWND'
    Assert-That ($c.bounds.width -gt 0 -and $c.bounds.height -gt 0) 'Candidate has no visible bounds'
    Assert-That $State.composing 'No current composition; older composition events cannot satisfy a new session'
    Assert-That ($c.compositionId -eq $State.compositionId -and $c.composingBefore) 'Candidate observation belongs to a different composition generation'
    Assert-That ($State.focused -and $State.documentFocused) 'Firefox textarea lost focus'
    Assert-That (@($State.events | Where-Object { $_.type -eq 'compositionstart' -and $_.trusted }).Count -gt 0) 'No trusted native composition'
    $fgpid = [uint32]0
    [void][Native]::GetWindowThreadProcessId([Native]::GetForegroundWindow(),[ref]$fgpid)
    Assert-That ($fgpid -eq $script:FirefoxPid) 'Firefox is not foreground'
    return $c
}

function Invoke-UIAProbe($Operation, $Name, [int]$TimeoutSeconds=30) {
    # Terminate an isolated OS process on timeout; Stop-Job can itself wait on a hung provider.
    Write-Host "WORKER START $Operation $Name"
    $worker = Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-File',
        "`"$PSScriptRoot/uia-worker.ps1`"",'-OutputPath',"`"$script:Output`"",'-Operation',$Operation,'-Name',$Name) -PassThru `
        -RedirectStandardOutput "$script:Output/worker-$Name-stdout.txt" -RedirectStandardError "$script:Output/worker-$Name-stderr.txt"
    try {
        [void]$worker.Handle
        if (-not $worker.WaitForExit($TimeoutSeconds * 1000)) {
            $worker.Kill()
            throw "UIA/OS $Operation $Name timed out after $TimeoutSeconds seconds"
        }
        $worker.Refresh()
        Write-Host "WORKER $Name exit=$($worker.ExitCode)"
        if (Test-Path "$script:Output/worker-$Name-error.txt") { Get-Content "$script:Output/worker-$Name-error.txt" | Write-Host }
        Assert-That ($worker.ExitCode -eq 0) "UIA/OS $Operation $Name failed; see worker-$Name-error.txt"
        if ($Operation -eq 'snapshot') {
            $snapshot = Get-Content -Raw "$script:Output/uia-$Name.json" | ConvertFrom-Json
            $nativeRecords = @($snapshot.records | Where-Object { $_.pid -ne $script:FirefoxPid -or $_.hwnd -ne 0 -or $_.automationId -match 'IME_' } | ForEach-Object {
                if ($_.name.Length -gt 300) { $_.name = $_.name.Substring(0,300) }
                $_
            })
            Write-Host "DESKTOP UIA $Name $(ConvertTo-Json -InputObject $nativeRecords -Depth 8 -Compress)"
            Write-Host "DESKTOP UIA ERRORS $Name $(ConvertTo-Json -InputObject $snapshot.errors -Compress) truncated=$($snapshot.truncated)"
        }
        if ($Operation -eq 'candidate') {
            $raw = Get-Content -Raw "$script:Output/candidate-$Name.json"
            Write-Host "CANDIDATE RAW $Name $raw"
            Assert-That ($raw.Trim().StartsWith('[') -and $raw.Trim().EndsWith(']')) 'UIA worker did not return a candidate array; inaccessible or missing observations cannot pass'
            $decoded = ConvertFrom-Json -InputObject $raw
            # PowerShell 5 can emit an empty JSON array as one pipeline object; foreach unwraps it.
            foreach ($item in $decoded) {
                if ($null -ne $item -and -not $item.offscreen) { Write-Output $item }
            }
        }
    } finally { $worker.Dispose() }
}
function Snapshot($Name) { Invoke-UIAProbe 'snapshot' $Name }
function Candidate($Name) { Invoke-UIAProbe 'candidate' $Name }
