param([string]$AppPath = 'work/native-ime-app')
$ErrorActionPreference = 'Stop'
$log = Join-Path (Get-Location) 'artifacts/windows-native-ime'
New-Item -ItemType Directory -Force $log | Out-Null
Start-Transcript "$log/application-prepare.txt"
try {
    $app = (Resolve-Path $AppPath).Path
    $sha = git -C $app rev-parse HEAD
    if ($sha -ne '73cf8a42c1e9d729ac61b2006ab9a6d8b10a3a8f') { throw "Unexpected application revision $sha" }
    @{applicationSha=$sha; correction='PR #5504'; harnessSha=$env:GITHUB_SHA; integrationCommits=@(); services='Disposable Firebase emulators, compiled Yjs server, Vite ordinary editor'} | ConvertTo-Json | Set-Content "$log/application-revision.json"
    # Package lifecycle scripts contain rm/ln/patch-package. Use the runner's Git Bash,
    # but install native dependencies on Windows from their own lockfiles.
    $env:npm_config_script_shell = 'C:\Program Files\Git\bin\bash.exe'
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    foreach ($dir in @('', 'client', 'server', 'functions')) {
        Push-Location (Join-Path $app $dir)
        try { npm ci 2>&1 | Out-File "$log/install-$($dir -replace '^$', 'root').txt"; if ($LASTEXITCODE -ne 0) { throw "npm ci failed in $dir" } } finally { Pop-Location }
    }
    if (Test-Path "$app/shared/node_modules") { Remove-Item "$app/shared/node_modules" -Force }
    New-Item -ItemType Junction -Path "$app/shared/node_modules" -Target "$app/server/node_modules" | Out-Null
    Push-Location "$app/server"
    try { node node_modules/typescript/bin/tsc 2>&1 | Out-File "$log/server-build.txt"; if ($LASTEXITCODE -ne 0) { throw 'Server compilation failed' } } finally { Pop-Location }
    if (-not (Test-Path "$app/server/dist/server/src/index.js")) { throw 'Compiled server missing' }
    Push-Location "$app/client"
    try { npm run paraglide:compile 2>&1 | Out-File "$log/paraglide-build.txt"; if ($LASTEXITCODE -ne 0) { throw 'Paraglide compilation failed' } } finally { Pop-Location }
    npm install --prefix "$app/work/tools" firebase-tools 2>&1 | Out-File "$log/firebase-tools-install.txt"
    if ($LASTEXITCODE -ne 0) { throw 'Firebase CLI install failed' }
    Invoke-WebRequest 'https://github.com/mozilla/geckodriver/releases/download/v0.36.0/geckodriver-v0.36.0-win64.zip' -OutFile "$log/geckodriver.zip" -UseBasicParsing
    Expand-Archive "$log/geckodriver.zip" "$log/geckodriver" -Force
} finally { Stop-Transcript }
