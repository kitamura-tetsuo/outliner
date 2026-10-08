param([string]$AppPath = 'work/native-ime-app', [string]$CacheHit = 'false')
$ErrorActionPreference = 'Stop'
$log = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force $log | Out-Null
Start-Transcript "$log/application-prepare.txt"
function Run-Preparation($Name, $Directory, $Arguments) {
    $node = (Get-Command node.exe).Source
    $p = Start-Process $node -ArgumentList $Arguments -WorkingDirectory $Directory -PassThru -RedirectStandardOutput "$log/$Name.stdout.txt" -RedirectStandardError "$log/$Name.stderr.txt"
    [void]$p.Handle
    $deadline = [DateTime]::UtcNow.AddMinutes(10)
    try {
        do {
            $p.Refresh()
            if ($p.HasExited) { break }
            if ([DateTime]::UtcNow -ge $deadline) { taskkill /PID $p.Id /T /F | Out-Null; throw "$Name timed out" }
            Start-Sleep -Milliseconds 250
        } while ($true)
        $p.WaitForExit()
        $p.Refresh()
        if ($p.ExitCode -ne 0) {
            Get-Content "$log/$Name.stdout.txt","$log/$Name.stderr.txt" | Select-Object -Last 60 | Write-Host
            throw "$Name exited $($p.ExitCode)"
        }
    } finally { $p.Dispose() }
}
try {
    $npm = Join-Path (Split-Path (Get-Command node.exe).Source) 'node_modules/npm/bin/npm-cli.js'
    $npmArg = "`"$npm`""
    $app = (Resolve-Path $AppPath).Path
    $sha = git -C $app rev-parse HEAD
    if ($sha -ne '7b90e6fb7b709cff0f6d6b19ef8e643a2f50eced') { throw "Unexpected application revision $sha" }
    @{applicationSha=$sha; correction='PR #5504'; correctionSha='73cf8a42c1e9d729ac61b2006ab9a6d8b10a3a8f'; harnessSha=$env:GITHUB_SHA; integrationCommits=@('7b90e6fb7b709cff0f6d6b19ef8e643a2f50eced'); services='Disposable Firebase emulators, compiled Yjs server, Vite ordinary editor'} | ConvertTo-Json | Set-Content "$log/application-revision.json"
    # Package lifecycle scripts contain rm/ln/patch-package. Use the runner's Git Bash,
    # but install native dependencies on Windows from their own lockfiles.
    $env:npm_config_script_shell = 'C:\Program Files\Git\bin\bash.exe'
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    if ($CacheHit -ne 'true') {
        foreach ($dir in @('', 'client', 'server', 'functions')) {
            $name = if ($dir) { $dir } else { 'root' }
            Run-Preparation "install-$name" (Join-Path $app $dir) @($npmArg,'ci')
        }
    }
    if (Test-Path "$app/shared/node_modules") {
        $sharedLink = Get-Item "$app/shared/node_modules" -Force
        if ($sharedLink.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            cmd.exe /c rmdir "$app/shared/node_modules"
        } else {
            # Git Bash can materialize ln -s as a copy on Windows. This disposable
            # dependency copy is replaced with a native junction, never Linux modules.
            Remove-Item "$app/shared/node_modules" -Recurse -Force
        }
    }
    New-Item -ItemType Junction -Path "$app/shared/node_modules" -Target "$app/client/node_modules" | Out-Null
    Run-Preparation 'server-build' "$app/server" @('node_modules/typescript/bin/tsc')
    if (-not (Test-Path "$app/server/dist/server/src/index.js")) { throw 'Compiled server missing' }
    Run-Preparation 'paraglide-build' "$app/client" @($npmArg,'run','paraglide:compile')
    if ($CacheHit -ne 'true') { Run-Preparation 'firebase-tools-install' $app @($npmArg,'install','--prefix','work/tools','firebase-tools') }
    Invoke-WebRequest 'https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-win64.zip' -OutFile "$log/geckodriver.zip" -UseBasicParsing
    Expand-Archive "$log/geckodriver.zip" "$log/geckodriver" -Force
} finally { Stop-Transcript }
