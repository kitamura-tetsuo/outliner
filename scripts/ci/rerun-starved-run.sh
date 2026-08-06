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

if [ "$starved_count" -eq 0 ]; then
    echo "No job in run $RUN_ID was starved of a runner; leaving the failure alone."
    exit 0
fi

echo "$starved_count job(s) in run $RUN_ID never reached a runner:"
printf '%s' "$starved" | jq -r '.[] | "  - " + .'

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
