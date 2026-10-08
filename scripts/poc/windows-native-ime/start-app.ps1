# Sourced by run.ps1; processes are stopped in its finally block.
$app = (Resolve-Path 'work/native-ime-app').Path
$env:NODE_ENV = 'test'
$env:TEST_ENV = 'localhost'
$env:ALLOW_TEST_ACCESS = 'true'
$env:FIREBASE_PROJECT_ID = 'outliner-d57b0'
$env:GCLOUD_PROJECT = 'outliner-d57b0'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:59099'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:58080'
$env:PORT = '7093'
$env:ORIGIN_ALLOWLIST = 'http://127.0.0.1:7090'
$env:E2E_DISABLE_HMR = '1'
$env:E2E_DISABLE_WATCH = '1'
$env:CI = 'true'
$script:AppProcesses = @()
function Start-AppProcess($Name, $Directory, $Arguments) {
    $p = Start-Process node -ArgumentList $Arguments -WorkingDirectory $Directory -PassThru -RedirectStandardOutput "$script:Output/app-$Name.stdout.txt" -RedirectStandardError "$script:Output/app-$Name.stderr.txt"
    $script:AppProcesses += $p
    return $p
}
node "$app/scripts/setup-emulator-config.js"
Assert-That ($LASTEXITCODE -eq 0) 'Emulator configuration generation failed'
node "$PSScriptRoot/configure-app.mjs" $app
Assert-That ($LASTEXITCODE -eq 0) 'Windows emulator port configuration failed'
[void](Start-AppProcess 'firebase' $app @('work/tools/node_modules/firebase-tools/lib/bin/firebase.js','emulators:start','--only','auth,firestore,functions,hosting','--project','outliner-d57b0','--config','firebase.emulator.json'))
[void](Start-AppProcess 'yjs' "$app/server" @('dist/server/src/index.js'))
$env:NODE_ENV = 'development' # Keep the existing Svelte-managed debug navigation available.
[void](Start-AppProcess 'client' "$app/client" @('node_modules/vite/bin/vite.js','dev','--config','vite.config.ts','--mode','test','--host','127.0.0.1','--port','7090','--strictPort'))
$deadline = [DateTime]::UtcNow.AddSeconds(180)
$ready = @{}
$urls = @('http://127.0.0.1:59099/', 'http://127.0.0.1:58080/', 'http://127.0.0.1:57070/api/health', 'http://127.0.0.1:7093/health', 'http://127.0.0.1:7090/')
do {
    foreach ($p in $script:AppProcesses) { $p.Refresh(); Assert-That (-not $p.HasExited) "Application process $($p.Id) exited; inspect app logs" }
    foreach ($url in $urls) {
        try { $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2; $ready[$url] = $r.StatusCode -eq 200 } catch { $ready[$url] = $false }
    }
    if (@($ready.Values | Where-Object { -not $_ }).Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
Save-Json 'application-readiness' @{services=$ready; deadlineSeconds=180}
Assert-That (@($ready.Values | Where-Object { -not $_ }).Count -eq 0) 'Application readiness failed within 180 seconds'
