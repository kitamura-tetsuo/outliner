# Starts the application revision under evaluation for the Windows native IME regression.
#
# Same Linux backend path as the prepared PoC (Ubuntu WSL2 -> native Linux Docker Engine ->
# Compose, reached from native Windows Firefox over localhost), but the application is the
# checkout in work/native-ime-app instead of the archived PoC pin. Its SHA is recorded
# separately from the harness SHA, baked into the image label, and the served client source
# is compared with that checkout before any native test runs.
$ErrorActionPreference = 'Stop'
$output = Join-Path (Get-Location) 'artifacts/windows-linux-backend'
$nativeOutput = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force $output, "$nativeOutput/geckodriver" | Out-Null
$app = (Resolve-Path 'work/native-ime-app').Path
$sha = git -C $app rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Application checkout has no resolvable HEAD' }
if ($env:NATIVE_IME_APPLICATION_SHA -and $env:NATIVE_IME_APPLICATION_SHA -ne $sha) {
    throw "Application checkout $sha differs from the requested revision $env:NATIVE_IME_APPLICATION_SHA"
}
function Linux-Path($Path) {
    $p = $Path -replace '\\','/'
    '/mnt/' + $p.Substring(0,1).ToLower() + $p.Substring(2)
}
# WSL system services alone do not keep a distribution running after its last foreground
# client exits. Keep a foreground WSL client for the complete test.
$keepalive = Start-Process wsl.exe -ArgumentList @('--distribution','Ubuntu','--user','root','--exec','sleep','infinity') -PassThru
[void]$keepalive.Handle
$keepalive.Id | Set-Content "$output/wsl-foreground.pid"
$archive = Join-Path (Get-Location) 'work/linux-application.tar'
$harness = Join-Path (Get-Location) 'work/linux-harness.tar'
# Without autocrlf=false, git archive on Windows rewrites the sources to CRLF; the backend must
# build and serve the committed bytes.
git -c core.autocrlf=false -C $app archive --format=tar --output=$archive HEAD
if ($LASTEXITCODE -ne 0) { throw 'Application source archive failed' }
git archive --format=tar --output=$harness HEAD scripts/poc/windows-native-ime scripts/poc/windows-linux-backend
if ($LASTEXITCODE -ne 0) { throw 'Harness source archive failed' }
$script = Linux-Path ((Resolve-Path 'scripts/poc/windows-linux-backend/start-compose.sh').Path)
$composeArguments = @('--distribution','Ubuntu','--user','root','--exec','bash',$script,(Linux-Path $archive),(Linux-Path $harness),$sha)
$p = Start-Process wsl.exe -ArgumentList $composeArguments -PassThru -RedirectStandardOutput "$output/compose-build.stdout.txt" -RedirectStandardError "$output/compose-build.stderr.txt"
[void]$p.Handle
try {
    $deadline = [DateTime]::UtcNow.AddMinutes(30)
    while (-not $p.HasExited) {
        if ([DateTime]::UtcNow -ge $deadline) { taskkill /PID $p.Id /T /F | Out-Null; throw 'Linux Compose build exceeded 30 minutes' }
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
@{source=$sha; services=$ready; deadlineSeconds=300} | ConvertTo-Json -Depth 10 | Set-Content "$output/windows-localhost-readiness.json"
if (@($ready.Values | Where-Object { -not $_ }).Count -gt 0) { throw 'Windows localhost did not reach every Linux Compose service' }
# The source Vite actually serves to Windows Firefox must be the evaluated checkout's.
node "$PSScriptRoot/../verify-served-revision.mjs" $app 'http://127.0.0.1:7090' "$nativeOutput/application-identity.json"
if ($LASTEXITCODE -ne 0) { throw 'Served application does not match the evaluated checkout' }
# Running container labels, read without shell quoting (Windows PowerShell mangles embedded quotes).
$labels = wsl.exe --distribution Ubuntu --user root --exec docker ps --format '{{.Labels}}'
$label = ([regex]::Match("$labels", 'org\.opencontainers\.image\.revision=([0-9a-f]{40})')).Groups[1].Value
if ($label -ne $sha) { throw "Running backend image label '$label' is not the evaluated revision $sha" }
Invoke-WebRequest 'https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-win64.zip' -OutFile "$nativeOutput/geckodriver.zip" -UseBasicParsing
Expand-Archive "$nativeOutput/geckodriver.zip" "$nativeOutput/geckodriver" -Force
@{applicationSha=$sha; applicationImageLabel=$label; harnessSha=$env:GITHUB_SHA;
  run="https://github.com/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID";
  services='Linux Compose on Ubuntu WSL2; native Windows Firefox';
  note='Current-revision regression; not the archived PoC application pin'} | ConvertTo-Json -Depth 10 | Set-Content "$nativeOutput/application-revision.json"
