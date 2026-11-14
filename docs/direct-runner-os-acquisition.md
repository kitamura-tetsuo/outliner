# Direct-runner OS acquisition

The direct-runner composite action calls `scripts/setup-direct-runner-os.sh`.
Its strict mode is confined to that invocation; local `setup.sh` keeps its
existing degraded behavior. The required utility, Chromium library and Canvas
package arrays are unchanged. APT signature verification and configured sources
remain enabled and unchanged.

The aggregate budget is **600 seconds**, comprising 595 seconds of work and
at most 5 seconds for TERM-to-KILL escalation of the command process group.
GNU `timeout` supervises the entire worker, including Java/version checks,
source refresh, all APT retries, dpkg repair, required-package verification,
the locked local Playwright CLI's `install-deps`, browser installation and
Firefox's existing launch check. This is below the unchanged 30-minute E2E job
timeout. `E2E_OS_BUDGET_SECONDS` can shorten the budget (6–600 seconds), never
extend it. It bounds this setup stage; earlier npm/cache steps can still consume
job time and an enclosing cancellation is not a successful setup.

Source refresh uses `APT::Update::Error-Mode=any` so a partial index refresh
cannot conceal an unavailable source. Diagnostics are visible in the existing
`job_logs/setup-browser-<browser>.log`. Every result includes the last stage,
actual exit status and elapsed seconds; 124/137 identify timeout outcomes.
Required packages must have `install ok installed` status, including installed
providers for Ubuntu's renamed t64 packages. Browser caches do not waive these
checks or Playwright dependency installation. Strict Chromium setup uses the
locked local CLI and cannot fall back to a different preinstalled revision.
No service/test readiness is reached after a failed setup step.

## Independent regression

With root/test npm dependencies installed and Docker control available, run:

```sh
bash scripts/run-env-tests.sh --isolated env-direct-runner-os-acquisition-5921b0ad.spec.ts
```

This mode does not run host setup. Tests build an Ubuntu 26.04 harness, then run
the production entrypoint in fresh disposable containers, mounting this checkout
read-only. Real authenticated Ubuntu packages and a real headless Chromium
page assertion establish success. Container-local refused and slow HTTP sources
exercise failure and the 15-second test budget. The harness independently
measures elapsed time and process status, rejects its own outer timeout, and
checks stage/source diagnostics. A warm browser cache plus a removed required
package and a real successful download-only APT command must still fail the
production package verifier. No package manager commands are mocked and no
host package/source/network state changes. Docker absence is a failed prerequisite,
not a skipped or passing regression.

## Incident evidence and publication validation

The retained incident is run **43026891337**, core-3 job **130548244153**,
merge SHA `bc6a7565a77c25a45fddf801f8b075b844d453b4`: APT reported resolution
failures for azure.archive.ubuntu.com, archive.ubuntu.com and
security.ubuntu.com before cancellation. OS acquisition continued and browser,
service and test execution had not begun. PR #5920's manifest/lockfile-only
changes do not establish a cause for that OS acquisition failure. The evidence
does not distinguish runner resolution/network conditions from package-service
conditions; neither fallback success nor a later successful rerun proves causality.

Before acceptance, run normal direct-runner CI at the **exact final repair SHA**
and retain its run/job URLs and setup/browser/test logs, including actual affected
E2E test execution/results. Record cancellation, unavailable Docker, unavailable
CI publication or unexecuted tests explicitly. Local shell/static checks and
isolated regression success cannot substitute for that evidence. This repair
must not be reported as completing the Issue before that validation is available.
