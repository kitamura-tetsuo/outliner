#!/usr/bin/env node
/**
 * Normalises the pull-request context every CI job consumes, so a full-CI run
 * behaves identically whether ordinary PR activity or the Playwright
 * corrected-head handoff started it.
 *
 *   pull_request       taken from the webhook payload (unchanged behaviour).
 *   workflow_dispatch  with the handoff inputs (pr_number + head_sha): the
 *                      inputs are only a claim. They are accepted when the
 *                      authoritative PR record names an open same-repository PR
 *                      whose source branch is the dispatched ref, that branch
 *                      and the PR head both read the dispatched commit
 *                      (github.sha), and head_sha names that same commit. The
 *                      base branch/SHA and labels then come from the PR record.
 *                      Anything else fails the run before any other job starts.
 *   anything else      (push, manual dispatch without handoff inputs): no PR
 *                      context, exactly as before.
 *
 * Inputs (environment): GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY,
 * GITHUB_REF, GITHUB_SHA, HANDOFF_PR_NUMBER, HANDOFF_HEAD_SHA, GH_TOKEN,
 * GITHUB_API_URL. Outputs ($GITHUB_OUTPUT): trigger, pr_number,
 * head_repository, head_ref, head_sha, base_ref, base_sha, labels, context.
 */

import fs from "fs";
import { assertPrAt, gitHubClient, HandoffRefusal, isPrNumber, isRepository, isSha } from "./github-rest.mjs";

/** Space-separated, sorted and de-duplicated label names. */
const normaliseLabels = (labels) => [...new Set((labels ?? []).map((l) => l?.name).filter(Boolean))].sort().join(" ");

function fromPullRequest(pr) {
    return {
        trigger: "pull_request",
        pr_number: String(pr.number),
        head_repository: pr.head?.repo?.full_name ?? "",
        head_ref: pr.head.ref,
        head_sha: pr.head.sha,
        base_ref: pr.base.ref,
        base_sha: pr.base.sha,
        labels: normaliseLabels(pr.labels),
    };
}

const NONE = {
    trigger: "none",
    pr_number: "",
    head_repository: "",
    head_ref: "",
    head_sha: "",
    base_ref: "",
    base_sha: "",
    labels: "",
};

async function resolvePrContext(env, api = gitHubClient()) {
    const event = env.GITHUB_EVENT_NAME;
    const prNumber = env.HANDOFF_PR_NUMBER ?? "";
    const headSha = env.HANDOFF_HEAD_SHA ?? "";

    if (event === "pull_request") {
        const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf-8"));
        return fromPullRequest(payload.pull_request);
    }
    if (event !== "workflow_dispatch" || (prNumber === "" && headSha === "")) return { ...NONE };

    // From here on the run claims to verify a PR head: every mismatch is fatal.
    const repository = env.GITHUB_REPOSITORY ?? "";
    const dispatched = env.GITHUB_SHA ?? "";
    const ref = (env.GITHUB_REF ?? "").startsWith("refs/heads/") ? env.GITHUB_REF.slice("refs/heads/".length) : "";
    if (!isRepository(repository)) {
        throw new HandoffRefusal("refused", `GITHUB_REPOSITORY ${JSON.stringify(repository)} is invalid.`);
    }
    if (!isPrNumber(prNumber)) {
        throw new HandoffRefusal("refused", `pr_number ${JSON.stringify(prNumber)} is not a pull-request number.`);
    }
    if (!isSha(headSha)) {
        throw new HandoffRefusal("refused", `head_sha ${JSON.stringify(headSha)} is not a full commit id.`);
    }
    if (!ref) {
        throw new HandoffRefusal(
            "refused",
            `the run was dispatched on ${JSON.stringify(env.GITHUB_REF)}, not a branch.`,
        );
    }
    if (dispatched !== headSha) {
        throw new HandoffRefusal(
            "stale",
            `the run was dispatched on ${ref}@${dispatched}, but the handoff names ${headSha}; the branch moved before the run started.`,
        );
    }
    const pr = await assertPrAt(api, { repository, prNumber, ref, sha: headSha });
    return { ...fromPullRequest(pr), trigger: "handoff" };
}

function writeOutputs(context) {
    if (!process.env.GITHUB_OUTPUT) return;
    const lines = Object.entries(context).map(([k, v]) => `${k}=${String(v).replace(/[\r\n]+/g, " ")}`);
    lines.push(`context=${JSON.stringify(context)}`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
}

try {
    const context = await resolvePrContext(process.env);
    writeOutputs(context);
    console.log(`pr-context: ${JSON.stringify(context)}`);
} catch (err) {
    const outcome = err instanceof HandoffRefusal ? err.outcome : "failed";
    console.log(
        `::error title=Corrected-head CI target rejected::${outcome}: ${err.message} `
            + "No PR checks were run for this dispatch; request verification again for the current PR head.",
    );
    process.exit(1);
}
