# new-3 runner interruption investigation (#5854)

## Conclusion

Repository-visible evidence does not identify who or what initiated either
runner shutdown. Both affected jobs ran on distinct GitHub-hosted runners and
were terminated while the `new-3` Playwright process was still producing test
output. No repository-controlled defect is established, so this investigation
does not change the workflow, its process cleanup, or any test, timeout, retry,
concurrency, or reporting policy.

The authoritative termination source is outside the evidence exposed by these
workflow runs. A maintainer may retry the supported CI path to restore validation,
but a passing retry would be recovery evidence only, not a causal finding. If the
interruption recurs, GitHub Support must inspect the hosted-runner diagnostics
and control-plane cancellation/audit records for the job IDs below.

## Observed executions

| Run / job                                                                                                                        | Commit                                     | Hosted runner                                      | Test-step interval (UTC)     | Terminal evidence                     | Job result |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- | ---------------------------- | ------------------------------------- | ---------- |
| [main run 41251173494 / job 124685883615](https://github.com/kitamura-tetsuo/outliner/actions/runs/41251173494/job/124685883615) | `c3d103beb41a17f43d4ae6b73e67cda66c221a89` | `GitHub Actions 1000322167`, label `ubuntu-latest` | 2026-11-01 00:14:22–00:18:15 | runner shutdown signal, then exit 143 | `failure`  |
| [PR run 41261494734 / job 124716433988](https://github.com/kitamura-tetsuo/outliner/actions/runs/41261494734/job/124716433988)   | `8a4a11be752650bb4150376fe1764bb72066b249` | `GitHub Actions 1000322507`, label `ubuntu-latest` | 2026-11-01 01:49:16–01:53:30 | runner shutdown signal, then exit 143 | `failure`  |

In both jobs, checkout, dependency setup, server build, and service startup
completed successfully. The shutdown arrived during `Run E2E tests (new-3)`.
The runner then skipped the failure summary, execution-status record, artifact
upload, and post-action steps before cleaning up orphan processes. The last
test output contains no final Playwright assertion result.

The Actions job API identifies the runner group as `GitHub Actions` and exposes
only the runner IDs, labels, step timing, and conclusions above. The run API
identifies `kitamura-tetsuo` as both actor and triggering actor, but those fields
identify who initiated the run, not who or what initiated a later shutdown.
The public logs do not contain the runner listener diagnostic entry, a
control-plane cancellation record, host health or eviction telemetry, or a
GitHub audit event that attributes the shutdown.

## Alternatives evaluated

- **Repository test or process failure:** not established. The runner-level
  shutdown message precedes exit 143, the test command had not returned, and no
  final assertion failure is present. Exit 143 records SIGTERM-derived process
  termination but does not identify the initiator.
- **Workflow timeout:** excluded for these jobs. Each job stopped less than six
  minutes after it started, while the workflow's E2E job budget is 30 minutes.
- **Matrix fail-fast:** excluded by the checked-in workflow, which sets
  `fail-fast: false`.
- **Repository concurrency cancellation:** not supported by the observed job
  conclusions. The two `new-3` jobs completed as `failure`, not `cancelled`, and
  neighboring matrix jobs continued after each interruption. This does not
  exclude an unexposed GitHub control-plane or manual runner shutdown.
- **Repository cleanup:** not a demonstrated initiator. Orphan-process cleanup
  appears after the shutdown and exit 143 in both logs.
- **Intentional cancellation or hosted runner/host interruption:** unresolved.
  Distinguishing these alternatives requires GitHub's runner listener and
  control-plane records, which repository Actions logs and APIs do not expose.

The separate main unit-job cancellation and previously retried Diagram failures
do not establish a cause for these `new-3` shutdowns and are outside this
investigation.

## Recovery and required authority

1. A repository maintainer can rerun the supported CI workflow at the exact
   affected SHA and retain the new run ID, `new-3` job ID, complete log, and
   actual conclusion. This restores missing validation if it completes, but
   must not be described as proof of the original cause.
2. If another shutdown occurs, open a GitHub Support request with both original
   run/job pairs and the recurrence. Ask GitHub to identify the shutdown reason
   from hosted-runner listener diagnostics, job cancellation/control-plane
   records, and host lifecycle telemetry.
3. Do not add retries, extend timeouts, suppress the nonzero exit, or change
   cleanup/test behavior without new evidence locating a repository-controlled
   defect. If GitHub supplies such evidence, any correction needs a lifecycle
   regression that independently proves normal success, intentional SIGTERM as
   non-success, and a genuine assertion failure as non-success before the
   corrected exact-SHA `new-3` path is accepted.
