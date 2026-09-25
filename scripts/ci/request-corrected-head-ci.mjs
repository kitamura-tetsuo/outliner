#!/usr/bin/env node
/**
 * Hands a corrected Playwright PR head over to full CI.
 *
 * A push made with GITHUB_TOKEN starts no executable pull_request run (at best
 * one that waits for approval), but a workflow_dispatch made with it does. So
 * this requests ci.yml on the PR's source branch with the PR number and the
 * corrected commit C as inputs; ci.yml's PR-context job re-validates that claim
 * against the PR record before any check runs, and then runs the same graph,
 * guards and gates as a pull_request run, attributed to C.
 *
 * Two entry points:
 *
 *   published  SYNC_RESULT is the JSON result of publish-playwright-sync.mjs.
 *              Only outcome "published" is accepted, and C must be a child of
 *              the prior head H whose only change is the Dockerfile Playwright
 *              version token computed from H's lockfile.
 *   recovery   PR_REPOSITORY + PR_NUMBER (+ optional EXPECTED_SHA), from the
 *              "Corrected-Head CI Handoff" workflow: the current remote head is
 *              read, cross-checked and must already be aligned. No commit is
 *              made in either mode.
 *
 * Either way the PR must be open, from this repository, and both the PR record
 * and the branch must read C. An applicable full-CI run for C that is queued,
 * running or successful is reused instead of dispatching another. After a
 * dispatch the created run is observed; an approval-waiting, missing or
 * already-failed run is a scheduling failure. Nothing here closes, reopens,
 * merges or pushes anything, and success only ever means "full CI for C has
 * been requested or is already under way"; verification itself is the result
 * of that run.
 *
 * Outcomes (also written to $GITHUB_OUTPUT as `result` JSON):
 *   requested          a new full-CI run for C was observed         exit 0
 *   reused             an applicable run for C already exists       exit 0
 *   refused | stale    the target is not (or no longer) valid       exit 1
 *   scheduling_failed  C stays published; retry entry printed        exit 1
 */

import { spawnSync } from "child_process";
import fs from "fs";
import {
    authoritativeVersion,
    DOCKERFILE,
    LOCKFILE,
    planDockerfileSync,
    PlaywrightSyncInputError,
} from "../playwright-version-sync-lib.mjs";
import {
    assertPrAt,
    CI_WORKFLOW,
    gitHubClient,
    HandoffRefusal,
    handoffRunName,
    isPrNumber,
    isRepository,
    isSha,
} from "./github-rest.mjs";

const HANDOFF_WORKFLOW = "ci-corrected-head-handoff.yml";
const ACTIVE = new Set(["queued", "in_progress", "requested", "pending"]);
const attempts = Number(process.env.HANDOFF_POLL_ATTEMPTS || 20);
const pollMs = Number(process.env.HANDOFF_POLL_MS || 3000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function git(args) {
    const result = spawnSync("git", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
    return result.stdout;
}

const blob = (commit, file) => git(["cat-file", "blob", `${commit}:${file}`]);

/** C is H plus exactly the Dockerfile version token that H's lockfile demands. */
function assertPublishedCorrection(H, C) {
    const parents = git(["rev-list", "--parents", "-n1", C]).trim().split(" ").slice(1);
    if (parents.length !== 1 || parents[0] !== H) {
        throw new HandoffRefusal(
            "refused",
            `${C} is not a single-parent child of ${H} (parents: ${parents.join(", ") || "none"}).`,
        );
    }
    const changed = git(["diff", "--name-only", H, C]).split("\n").filter(Boolean);
    const expected = planDockerfileSync(blob(H, DOCKERFILE), authoritativeVersion(blob(H, LOCKFILE)));
    if (
        changed.length !== 1 || changed[0] !== DOCKERFILE || !expected.changed
        || blob(C, DOCKERFILE) !== expected.content
    ) {
        throw new HandoffRefusal(
            "refused",
            `${C} is not the Playwright version-token correction of ${H} (changed: ${
                changed.join(", ") || "nothing"
            }).`,
        );
    }
}

/** The current head of a PR whose Playwright image is already aligned; fills `target` as it is learned. */
async function recoveryTarget(api, env, target) {
    const repository = env.PR_REPOSITORY ?? "";
    const prNumber = env.PR_NUMBER ?? "";
    const expected = env.EXPECTED_SHA ?? "";
    if (!isRepository(repository)) {
        throw new HandoffRefusal("refused", `PR_REPOSITORY ${JSON.stringify(repository)} is invalid.`);
    }
    if (!isPrNumber(prNumber)) {
        throw new HandoffRefusal("refused", `PR_NUMBER ${JSON.stringify(prNumber)} is not a pull-request number.`);
    }
    if (expected && !isSha(expected)) {
        throw new HandoffRefusal("refused", `EXPECTED_SHA ${JSON.stringify(expected)} is not a full commit id.`);
    }
    const pr = await api.pull(repository, prNumber);
    Object.assign(target, {
        repository,
        pr_number: prNumber,
        source_ref: pr?.head?.ref ?? "",
        head_sha: pr?.head?.sha ?? "",
    });
    if (expected && target.head_sha !== expected) {
        throw new HandoffRefusal(
            "stale",
            `${repository}#${prNumber} head is ${target.head_sha}, not the requested ${expected}.`,
        );
    }
    await assertPrAt(api, { repository, prNumber, ref: target.source_ref, sha: target.head_sha });

    const shallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
    git(["fetch", "--no-tags", ...(shallow ? ["--depth=1"] : []), "origin", `refs/heads/${target.source_ref}`]);
    const fetched = git(["rev-parse", "FETCH_HEAD"]).trim();
    if (fetched !== target.head_sha) {
        throw new HandoffRefusal(
            "stale",
            `refs/heads/${target.source_ref} fetched as ${fetched}, not ${target.head_sha}.`,
        );
    }
    if (planDockerfileSync(blob(fetched, DOCKERFILE), authoritativeVersion(blob(fetched, LOCKFILE))).changed) {
        throw new HandoffRefusal(
            "refused",
            `${target.source_ref}@${fetched} is not aligned yet; a CI run on it publishes the correction first.`,
        );
    }
    return target;
}

async function publishedTarget(api, syncResult) {
    let sync;
    try {
        sync = JSON.parse(syncResult);
    } catch {
        throw new HandoffRefusal("refused", "SYNC_RESULT is not the publisher's JSON result.");
    }
    const target = {
        repository: sync?.repository ?? "",
        pr_number: sync?.pr_number ?? "",
        source_ref: sync?.source_ref ?? "",
        head_sha: sync?.result_sha ?? "",
    };
    if (sync?.outcome !== "published") {
        throw new HandoffRefusal(
            "refused",
            `the publisher reported ${JSON.stringify(sync?.outcome)}, not a confirmed publication.`,
        );
    }
    if (
        !isRepository(target.repository) || !isPrNumber(target.pr_number) || !isSha(sync.source_sha)
        || !isSha(target.head_sha)
    ) {
        throw new HandoffRefusal(
            "refused",
            "the publisher's result lacks a valid repository, PR number or commit ids.",
        );
    }
    assertPublishedCorrection(sync.source_sha, target.head_sha);
    for (let i = 1;; i++) {
        try {
            await assertPrAt(api, {
                repository: target.repository,
                prNumber: target.pr_number,
                ref: target.source_ref,
                sha: target.head_sha,
                previousSha: sync.source_sha,
            });
            return target;
        } catch (err) {
            if (!(err instanceof HandoffRefusal) || err.outcome !== "lagging" || i >= attempts) {
                if (err instanceof HandoffRefusal && err.outcome === "lagging") err.outcome = "stale";
                throw err;
            }
            await sleep(pollMs);
        }
    }
}

/** A full-CI run that evaluates exactly this PR head with PR context. */
function applicable(run, target) {
    if (run.head_sha !== target.head_sha) return false;
    if (run.event === "workflow_dispatch") {
        return run.head_branch === target.source_ref
            && run.display_title === handoffRunName(target.pr_number, target.head_sha);
    }
    return run.event === "pull_request"
        && (run.pull_requests ?? []).some((pr) => String(pr.number) === target.pr_number);
}

const usable = (run) => ACTIVE.has(run.status) || (run.status === "completed" && run.conclusion === "success");

async function handOff(api, target) {
    const before = (await api.workflowRuns(target.repository, CI_WORKFLOW, target.head_sha)).filter((r) =>
        applicable(r, target)
    );
    const existing = before.find(usable);
    if (existing) {
        return {
            outcome: "reused",
            run: existing,
            detail: existing.status === "completed"
                ? `full CI already succeeded for ${target.head_sha}: ${existing.html_url}`
                : `full CI for ${target.head_sha} is already ${existing.status}: ${existing.html_url}`,
        };
    }

    // Last authority check immediately before the request; ci.yml repeats it.
    await assertPrAt(api, {
        repository: target.repository,
        prNumber: target.pr_number,
        ref: target.source_ref,
        sha: target.head_sha,
    });
    try {
        await api.dispatch(target.repository, CI_WORKFLOW, target.source_ref, {
            pr_number: target.pr_number,
            head_sha: target.head_sha,
        });
    } catch (err) {
        throw new HandoffRefusal("scheduling_failed", `the ${CI_WORKFLOW} dispatch was rejected: ${err.message}`);
    }

    const seen = new Set(before.map((r) => r.id));
    for (let i = 0; i < attempts; i++) {
        const run = (await api.workflowRuns(target.repository, CI_WORKFLOW, target.head_sha))
            .find((r) => !seen.has(r.id) && applicable(r, target));
        if (run) {
            if (run.status === "waiting" || run.conclusion === "action_required") {
                throw new HandoffRefusal(
                    "scheduling_failed",
                    `the full-CI run for ${target.head_sha} is waiting for approval: ${run.html_url}`,
                );
            }
            if (!usable(run)) {
                throw new HandoffRefusal(
                    "scheduling_failed",
                    `the full-CI run for ${target.head_sha} ended ${
                        run.conclusion ?? run.status
                    } at once: ${run.html_url}`,
                );
            }
            return {
                outcome: "requested",
                run,
                detail: `full CI for ${target.head_sha} is ${run.status}: ${run.html_url}`,
            };
        }
        await sleep(pollMs);
    }
    // A branch that moved between the last check and the dispatch leaves the run
    // on the newer commit, where ci.yml rejects the stale claim: report that.
    await assertPrAt(api, {
        repository: target.repository,
        prNumber: target.pr_number,
        ref: target.source_ref,
        sha: target.head_sha,
    });
    throw new HandoffRefusal(
        "scheduling_failed",
        `the dispatch was acknowledged, but no full-CI run for ${target.head_sha} on ${target.source_ref} appeared.`,
    );
}

const retryEntry = (target) =>
    target.repository && target.pr_number
        ? `gh workflow run ${HANDOFF_WORKFLOW} --repo ${target.repository} -f pr_number=${target.pr_number}`
            + (isSha(target.head_sha) ? ` -f head_sha=${target.head_sha}` : "")
        : "";

function report(target, outcome, detail, run) {
    const result = {
        outcome,
        repository: target.repository,
        pr_number: target.pr_number,
        source_ref: target.source_ref,
        head_sha: target.head_sha,
        run_id: run ? String(run.id) : "",
        run_url: run?.html_url ?? "",
        // Only the run's own checks can verify the head; this step never does.
        verification: run?.status === "completed" && run.conclusion === "success"
            ? "succeeded"
            : run
            ? "pending"
            : "not-started",
        retry: outcome === "scheduling_failed" ? retryEntry(target) : "",
        detail,
    };
    const oneLine = (value) => String(value).replace(/[\r\n]+/g, " ");
    if (process.env.GITHUB_OUTPUT) {
        const lines = Object.entries(result).map(([k, v]) => `${k}=${oneLine(v)}`);
        lines.push(`result=${JSON.stringify(result)}`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(
            process.env.GITHUB_STEP_SUMMARY,
            `### Corrected-head CI handoff: ${outcome}\n\n${oneLine(detail)}\n${
                result.retry ? `\nRetry: \`${result.retry}\`\n` : ""
            }`,
        );
    }
    console.log(`corrected-head-ci-result: ${JSON.stringify(result)}`);
    return result;
}

const api = gitHubClient();
let target = {
    repository: process.env.PR_REPOSITORY ?? "",
    pr_number: process.env.PR_NUMBER ?? "",
    source_ref: "",
    head_sha: process.env.EXPECTED_SHA ?? "",
};
if (process.env.SYNC_RESULT) {
    try {
        const sync = JSON.parse(process.env.SYNC_RESULT);
        target = {
            repository: sync.repository ?? "",
            pr_number: sync.pr_number ?? "",
            source_ref: sync.source_ref ?? "",
            head_sha: sync.result_sha ?? "",
        };
    } catch {
        // publishedTarget reports the malformed result.
    }
}

try {
    target = process.env.SYNC_RESULT
        ? await publishedTarget(api, process.env.SYNC_RESULT)
        : await recoveryTarget(api, process.env, target);
    const { outcome, run, detail } = await handOff(api, target);
    report(target, outcome, detail, run);
    console.log(`✅ ${detail} Verification is the result of that run.`);
} catch (err) {
    const outcome = err instanceof HandoffRefusal
        ? err.outcome
        : err instanceof PlaywrightSyncInputError
        ? "refused"
        : "scheduling_failed";
    const result = report(target, outcome, err.message);
    console.log(
        `::error title=Full CI not scheduled for the corrected head::${target.repository}#${target.pr_number} `
            + `branch ${target.source_ref || "(unknown)"} at ${
                target.head_sha || "(unknown)"
            }: ${outcome}: ${err.message}`
            + (result.retry
                ? ` The correction stays on the branch. Retry with: ${result.retry}`
                : " Nothing was requested for this target."),
    );
    process.exit(1);
}
