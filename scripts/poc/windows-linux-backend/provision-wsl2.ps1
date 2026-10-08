$ErrorActionPreference = 'Stop'
$output = Join-Path (Get-Location) 'artifacts/windows-linux-backend'
New-Item -ItemType Directory -Force $output | Out-Null
Start-Transcript "$output/provision.txt"
$commands = @()
function Invoke-Provision($Name, $Executable, $Arguments, $Seconds=300) {
    $start = @{FilePath=$Executable; PassThru=$true; RedirectStandardOutput="$output/$Name.stdout.txt"; RedirectStandardError="$output/$Name.stderr.txt"}
    if (@($Arguments).Count -gt 0) { $start.ArgumentList = $Arguments }
    $p = Start-Process @start
    [void]$p.Handle
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    $timedOut = $false
    try {
        do {
            $p.Refresh()
            if ($p.HasExited) { break }
            if ([DateTime]::UtcNow -ge $deadline) { $timedOut = $true; taskkill /PID $p.Id /T /F | Out-Null; break }
            Start-Sleep -Milliseconds 250
        } while ($true)
        $p.WaitForExit()
        $record = @{name=$Name; executable=$Executable; arguments=$Arguments; exitCode=$p.ExitCode; timedOut=$timedOut; deadlineSeconds=$Seconds}
        $script:commands += $record
        $record | ConvertTo-Json -Depth 10 | Set-Content "$output/$Name.result.json"
        Write-Host "PROVISION $Name exit=$($p.ExitCode) timeout=$timedOut"
        return $record
    } finally { $p.Dispose() }
}
function Feature-State {
    foreach ($name in @('Microsoft-Windows-Subsystem-Linux','VirtualMachinePlatform')) {
        Get-WindowsOptionalFeature -Online -FeatureName $name | Select-Object FeatureName,State,RestartRequired
    }
}
$result = @{status='BLOCKED'; stage='platform-inventory'; harnessSha=$env:GITHUB_SHA; applicationSha='0b5e6b0b1d3985e6789a6d826c5a76a180642a6d'; run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID"; productionJ='NOT TESTED'; productionK='NOT TESTED'}
try {
    @{os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber); computer=(Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,HypervisorPresent); processor=@(Get-CimInstance Win32_Processor | Select-Object Name,VirtualizationFirmwareEnabled,VMMonitorModeExtensions,SecondLevelAddressTranslationExtensions); features=@(Feature-State); imageOS=$env:ImageOS; imageVersion=$env:ImageVersion} | ConvertTo-Json -Depth 15 | Set-Content "$output/platform-before.json"
    [void](Invoke-Provision 'systeminfo' 'systeminfo.exe' @() 60)
    [void](Invoke-Provision 'wsl-version-before' 'wsl.exe' @('--version') 30)
    [void](Invoke-Provision 'wsl-status-before' 'wsl.exe' @('--status') 30)
    $result.stage = 'enable-wsl2-features'
    foreach ($feature in @(Feature-State)) {
        if ($feature.State -ne 'Enabled') {
            $enabled = Invoke-Provision "enable-$($feature.FeatureName)" 'dism.exe' @('/online','/enable-feature',"/featurename:$($feature.FeatureName)",'/all','/norestart') 180
            if ($enabled.timedOut -or $enabled.exitCode -notin @(0,3010)) { throw "DISM could not enable $($feature.FeatureName); inspect exact command output" }
        }
    }
    $result.stage = 'install-wsl2-runtime'
    $installed = Invoke-Provision 'wsl-runtime-install' 'wsl.exe' @('--install','--no-distribution','--web-download') 300
    [void](Invoke-Provision 'wsl-version-after' 'wsl.exe' @('--version') 30)
    [void](Invoke-Provision 'wsl-status-after' 'wsl.exe' @('--status') 30)
    if ($installed.timedOut -or $installed.exitCode -notin @(0,3010)) { throw 'WSL runtime installation failed; inspect wsl-runtime-install stdout/stderr and result' }
    $result.stage = 'provision-ubuntu-wsl2'
    [void](Invoke-Provision 'wsl-default-version' 'wsl.exe' @('--set-default-version','2') 30)
    $ubuntu = Invoke-Provision 'ubuntu-install' 'wsl.exe' @('--install','--distribution','Ubuntu','--web-download','--no-launch') 300
    [void](Invoke-Provision 'wsl-distributions' 'wsl.exe' @('--list','--verbose') 30)
    $kernel = Invoke-Provision 'ubuntu-kernel' 'wsl.exe' @('--distribution','Ubuntu','--user','root','--exec','uname','-a') 60
    if ($ubuntu.timedOut -or $ubuntu.exitCode -ne 0 -or $kernel.timedOut -or $kernel.exitCode -ne 0) {
        throw 'Ubuntu WSL2 could not be provisioned/launched in this hosted job; inspect installer/kernel HRESULT and feature/reboot observations'
    }
    $kernelText = (Get-Content "$output/ubuntu-kernel.stdout.txt" -Raw) -replace "`0",''
    if ($kernelText -notmatch '(?i)microsoft.*wsl2') { throw 'A running WSL2 kernel was not established; WSL1 is not accepted' }
    $result.stage = 'native-linux-docker-engine'
    $linux = (Resolve-Path 'scripts/poc/windows-linux-backend/install-engine.sh').Path -replace '\\','/'
    $linuxPath = '/mnt/' + $linux.Substring(0,1).ToLower() + $linux.Substring(2)
    $engine = Invoke-Provision 'linux-docker-engine' 'wsl.exe' @('--distribution','Ubuntu','--user','root','--exec','bash',$linuxPath) 600
    if ($engine.timedOut -or $engine.exitCode -ne 0) { throw 'Native Linux Docker Engine/Compose setup failed; inspect linux-docker-engine output' }
    $result.status = 'PROVEN'
    $result.stage = 'linux-engine-ready'
    $result.evidence = 'Ubuntu WSL2 kernel, Linux dockerd on unix socket, docker info OSType=linux and Compose version. Application services and J-K require their separate validation.'
} catch {
    $result.cause = $_.Exception.Message
    $_ | Out-String | Set-Content "$output/failure.txt"
    Write-Host "WSL2 BLOCKED at $($result.stage): $($result.cause)"
} finally {
    try { @(Feature-State) | ConvertTo-Json -Depth 10 | Set-Content "$output/features-after.json" } catch { $_ | Out-String | Set-Content "$output/features-observation-error.txt" }
    $result.commands = $commands
    $result | ConvertTo-Json -Depth 15 | Set-Content "$output/result.json"
    Stop-Transcript
}
if ($result.status -ne 'PROVEN') { exit 1 }
