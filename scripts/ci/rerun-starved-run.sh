#!/usr/bin/env bash
# Re-run a workflow run whose jobs never reached a runner.
#
# Motivation: when GitHub cannot hand a queued job to a hosted runner it keeps
# retrying and, after roughly 15 minutes, kills the job with
#
#   The job was not acquired by Runner of type hosted even after multiple attempts
#
# Nothing of the job ran, yet the whole run is reported as a failure -- and in
# ci.yml a starved `pr-guards` takes all eleven downstream jobs with it, so a PR
# goes red without a single test having executed. The only useful response is to
# queue the run again.
#
# Signature of a starved job in the REST API:
#   conclusion  == "cancelled"
#   runner_name == ""            (no runner was ever assigned)
#   completed_at - started_at    >= the acquisition timeout
# while the run itself concludes as "failure". A run cancelled for an ordinary
# reason (a superseding push through `cancel-in-progress`, a manual cancel)
# concludes as "cancelled", and its jobs give up long before the timeout, so
# neither is retried here.
#
# A hosted runner can also die mid-run: the job then concludes as "failure"
# with a runner assigned, but its steps never reach a terminal state (e.g. run
# 38041845041, e2e core-3: startup frozen `in_progress`, the test step still
# `pending`, no step failed, job dead after ~1 minute with nothing executed).
# That shape carries no verdict either, so it is re-queued as well. The guard
# is deliberately narrow -- any job with a failed step keeps its failure --
# so a genuine test or script failure is never mistaken for a lost runner.
#
# Environment:
#   GH_TOKEN            token with `actions: write` on the repository
#   REPO                owner/name (defaults to GITHUB_REPOSITORY)
#   RUN_ID              the workflow run to inspect and re-run
#   RUN_ATTEMPT         attempt number that just concluded (default 1)
#   MAX_ATTEMPTS        stop retrying at this attempt count (default 3)
#   MIN_QUEUED_SECONDS  how long a job must have waited to count as starved
#                       (default 600, against an acquisition timeout of ~900)

set -euo pipefail

REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
RUN_ID="${RUN_ID:-}"
RUN_ATTEMPT="${RUN_ATTEMPT:-1}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
MIN_QUEUED_SECONDS="${MIN_QUEUED_SECONDS:-600}"

if [ -z "$REPO" ] || [ -z "$RUN_ID" ]; then
    echo "REPO and RUN_ID are required" >&2
    exit 1
fi

if [ "$RUN_ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "Run $RUN_ID has already used $RUN_ATTEMPT of $MAX_ATTEMPTS attempts; not retrying."
    exit 0
fi

jobs_json="$(gh api "repos/$REPO/actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs?per_page=100")"

starved="$(
    printf '%s' "$jobs_json" | jq -r --argjson min "$MIN_QUEUED_SECONDS" '
    [ .jobs[]
      | select(.conclusion == "cancelled")
      | select((.runner_name // "") == "")
      | select(.started_at != null and .completed_at != null)
      | select(((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)) >= $min)
      | .name
    ]'
)"

starved_count="$(printf '%s' "$starved" | jq -r 'length')"

if [ "$starved_count" -gt 0 ]; then
    echo "$starved_count job(s) in run $RUN_ID never reached a runner:"
    printf '%s' "$starved" | jq -r '.[] | "  - " + .'
fi

runner_lost="$(
    printf '%s' "$jobs_json" | jq -r '
    [ .jobs[]
      | select(.conclusion == "failure")
      | select((.runner_name // "") != "")
      | select((.steps // []) | length > 0)
      | select([.steps[] | select(.conclusion == "failure")] | length == 0)
      | select([.steps[] | select(.status != "completed")] | length > 0)
      | .name
    ]'
)"

runner_lost_count="$(printf '%s' "$runner_lost" | jq -r 'length')"

if [ "$runner_lost_count" -gt 0 ]; then
    echo "$runner_lost_count job(s) in run $RUN_ID lost their runner before any step reported a verdict:"
    printf '%s' "$runner_lost" | jq -r '.[] | "  - " + .'
fi

if [ "$starved_count" -eq 0 ] && [ "$runner_lost_count" -eq 0 ]; then
    echo "No job in run $RUN_ID was starved of a runner; leaving the failure alone."
    exit 0
fi

# `rerun-failed-jobs` keeps the successful jobs of the attempt and re-queues the
# rest together with everything that depended on them. It rejects runs with no
# re-runnable failure, so fall back to re-running the whole thing.
if gh api -X POST "repos/$REPO/actions/runs/$RUN_ID/rerun-failed-jobs"; then
    echo "Re-queued the failed jobs of run $RUN_ID (attempt $((RUN_ATTEMPT + 1)))."
else
    echo "Re-running the failed jobs was rejected; re-running the whole run instead."
    gh api -X POST "repos/$REPO/actions/runs/$RUN_ID/rerun"
    echo "Re-queued run $RUN_ID (attempt $((RUN_ATTEMPT + 1)))."
fi
