$ErrorActionPreference = 'Stop'
$output = Join-Path (Get-Location) 'artifacts/windows-linux-backend'
$app = (Resolve-Path 'work/native-ime-app').Path
$sha = git -C $app rev-parse HEAD
if ($sha -ne '0b5e6b0b1d3985e6789a6d826c5a76a180642a6d') { throw "Unexpected application source $sha" }
function Linux-Path($Path) {
    $p = $Path -replace '\\','/'
    '/mnt/' + $p.Substring(0,1).ToLower() + $p.Substring(2)
}
# WSL system services alone do not keep a distribution running after its last
# foreground client exits. Keep a foreground WSL client for the complete probe.
$keepalive = Start-Process wsl.exe -ArgumentList @('--distribution','Ubuntu','--user','root','--exec','sleep','infinity') -PassThru
[void]$keepalive.Handle
$keepalive.Id | Set-Content "$output/wsl-foreground.pid"
$archive = Join-Path (Get-Location) 'work/linux-application.tar'
$harness = Join-Path (Get-Location) 'work/linux-harness.tar'
git -C $app archive --format=tar --output=$archive HEAD
if ($LASTEXITCODE -ne 0) { throw 'Application source archive failed' }
git archive --format=tar --output=$harness HEAD scripts/poc/windows-native-ime scripts/poc/windows-linux-backend
if ($LASTEXITCODE -ne 0) { throw 'Harness source archive failed' }
$script = Linux-Path ((Resolve-Path 'scripts/poc/windows-linux-backend/start-compose.sh').Path)
$composeArguments = @('--distribution','Ubuntu','--user','root','--exec','bash',$script,(Linux-Path $archive),(Linux-Path $harness),$sha)
$p = Start-Process wsl.exe -ArgumentList $composeArguments -PassThru -RedirectStandardOutput "$output/compose-build.stdout.txt" -RedirectStandardError "$output/compose-build.stderr.txt"
[void]$p.Handle
try {
    $deadline = [DateTime]::UtcNow.AddMinutes(25)
    while (-not $p.HasExited) {
        if ([DateTime]::UtcNow -ge $deadline) { taskkill /PID $p.Id /T /F | Out-Null; throw 'Linux Compose build exceeded 25 minutes' }
        Start-Sleep -Milliseconds 500
        $p.Refresh()
    }
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) { throw "Linux Compose startup exited $($p.ExitCode); inspect build and container diagnostics" }
} finally { $p.Dispose() }
$verify = Linux-Path ((Resolve-Path 'scripts/poc/windows-linux-backend/verify-services.sh').Path)
wsl.exe --distribution Ubuntu --user root --exec bash $verify > "$output/linux-readiness.txt" 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Linux services failed their in-distribution readiness checks; inspect collected service diagnostics' }
$ready = @{}
$deadline = [DateTime]::UtcNow.AddMinutes(5)
$urls = @('http://127.0.0.1:7090/','http://127.0.0.1:7093/health','http://127.0.0.1:57070/api/health','http://127.0.0.1:59099/','http://127.0.0.1:58080/')
do {
    foreach ($url in $urls) {
        try { $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3; $ready[$url] = $r.StatusCode -eq 200 } catch { $ready[$url] = $false }
    }
    if (@($ready.Values | Where-Object { -not $_ }).Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
@{source=$sha; architecture='Windows localhost -> Ubuntu WSL2 -> native Linux Docker Engine -> Compose backend'; services=$ready; deadlineSeconds=300; browserReachability='Requires the subsequent Windows-native Firefox browser checks; HTTP readiness alone is not J-K proof'} | ConvertTo-Json -Depth 10 | Set-Content "$output/windows-localhost-readiness.json"
if (@($ready.Values | Where-Object { -not $_ }).Count -gt 0) { throw 'Windows localhost did not reach every Linux Compose service' }
$nativeOutput = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force "$nativeOutput/geckodriver" | Out-Null
Invoke-WebRequest 'https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-win64.zip' -OutFile "$nativeOutput/geckodriver.zip" -UseBasicParsing
Expand-Archive "$nativeOutput/geckodriver.zip" "$nativeOutput/geckodriver" -Force
@{applicationSha=$sha; correction='PR #5504'; correctionSha='73cf8a42c1e9d729ac61b2006ab9a6d8b10a3a8f'; integrationCommits=@('7b90e6fb7b709cff0f6d6b19ef8e643a2f50eced','79a976cd8765367ea4f04baa00905822681cf294','0b5e6b0b1d3985e6789a6d826c5a76a180642a6d'); harnessSha=$env:GITHUB_SHA; services='Linux Compose on Ubuntu WSL2; native Windows Firefox'} | ConvertTo-Json -Depth 10 | Set-Content "$nativeOutput/application-revision.json"
