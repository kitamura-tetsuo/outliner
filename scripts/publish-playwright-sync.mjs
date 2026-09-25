#!/usr/bin/env node
/**
 * Publishes the Playwright Dockerfile correction to a pull request's source
 * branch.
 *
 * A pull_request checkout is the synthetic merge of the PR into its base, in
 * detached HEAD, so nothing about the working tree identifies the branch to
 * update. Everything here is therefore taken from the PR metadata the workflow
 * passes in, and the working tree, index and HEAD are never touched:
 *
 *   1. read the lockfile and Dockerfile from the source head H itself;
 *   2. build commit C = H + the Dockerfile version token, with a private index;
 *   3. push C to refs/heads/<source ref> only if that ref is still H
 *      (--force-with-lease=<ref>:H is a compare-and-swap on the server, and C
 *      is a child of H, so no history is rewritten);
 *   4. confirm the remote ref now reads C before claiming publication.
 *
 * Inputs (environment): PR_REPOSITORY, PR_HEAD_REPOSITORY, PR_NUMBER,
 * PR_HEAD_REF, PR_HEAD_SHA. The result is written to $GITHUB_OUTPUT (one key
 * per field plus `result` as JSON) and printed as a `playwright-sync-result:`
 * JSON line. Outcomes:
 *
 *   published   C is confirmed on the remote source ref           exit 0
 *   aligned     H already matches; nothing was written             exit 0
 *   ineligible  no same-repository PR target; nothing was written  exit 0
 *   stale       the source ref no longer points at H               exit 1
 *   failed      invalid input, or the update was rejected/unconfirmed exit 1
 *
 * None of these claim anything about the rest of CI.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
    authoritativeVersion,
    DOCKERFILE,
    LOCKFILE,
    planDockerfileSync,
    PlaywrightSyncInputError,
    requiredImage,
} from "./playwright-version-sync-lib.mjs";

const REMOTE = "origin";
const COMMIT_MESSAGE = "Auto-fix: Sync Playwright Dockerfile image version with lockfile";
const BOT_IDENTITY = {
    GIT_AUTHOR_NAME: "GitHub Action",
    GIT_AUTHOR_EMAIL: "action@github.com",
    GIT_COMMITTER_NAME: "GitHub Action",
    GIT_COMMITTER_EMAIL: "action@github.com",
};

class Outcome extends Error {
    constructor(outcome, detail) {
        super(detail);
        this.outcome = outcome;
    }
}

function git(args, { env, input, allowFailure = false } = {}) {
    const result = spawnSync("git", args, {
        encoding: "utf-8",
        input,
        env: { ...process.env, ...env },
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && !allowFailure) {
        throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    return result;
}

const gitOut = (args, options) => git(args, options).stdout.trim();

/** The commit the remote ref currently names, or "" when the ref does not exist. */
function remoteHead(ref) {
    const result = git(["ls-remote", "--exit-code", REMOTE, ref], { allowFailure: true });
    if (result.status === 2) return "";
    if (result.status !== 0) {
        throw new Error(`could not read ${ref} from ${REMOTE}: ${result.stderr.trim()}`);
    }
    const line = result.stdout.split("\n").find((l) => l.endsWith(`\t${ref}`));
    return line ? line.split("\t")[0] : "";
}

function staleUnlessAt(ref, expected, observed) {
    if (observed !== expected) {
        throw new Outcome(
            "stale",
            observed
                ? `${ref} has moved from ${expected} to ${observed}; the correction computed from ${expected} was not published.`
                : `${ref} no longer exists; the correction computed from ${expected} was not published.`,
        );
    }
}

function readTarget(env) {
    const target = {
        repository: env.PR_REPOSITORY ?? "",
        pr_number: env.PR_NUMBER ?? "",
        source_ref: env.PR_HEAD_REF ?? "",
        source_sha: env.PR_HEAD_SHA ?? "",
    };
    const missing = ["PR_REPOSITORY", "PR_HEAD_REPOSITORY", "PR_NUMBER", "PR_HEAD_REF", "PR_HEAD_SHA"]
        .filter((name) => !env[name]);
    if (missing.length > 0) {
        return { target, refusal: `no pull-request writeback target (missing ${missing.join(", ")})` };
    }
    if (env.PR_HEAD_REPOSITORY !== env.PR_REPOSITORY) {
        return { target, refusal: `the source branch lives in ${env.PR_HEAD_REPOSITORY}, not ${env.PR_REPOSITORY}` };
    }
    if (!/^[1-9]\d*$/.test(target.pr_number)) {
        return { target, refusal: `PR_NUMBER ${JSON.stringify(target.pr_number)} is not a pull-request number` };
    }
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(target.source_sha)) {
        return { target, refusal: `PR_HEAD_SHA ${JSON.stringify(target.source_sha)} is not a full commit id` };
    }
    if (git(["check-ref-format", `refs/heads/${target.source_ref}`], { allowFailure: true }).status !== 0) {
        return { target, refusal: `PR_HEAD_REF ${JSON.stringify(target.source_ref)} is not a valid branch name` };
    }
    return { target };
}

/** Reads a file as it exists in `commit`, with its tree entry. */
function readBlob(commit, file) {
    const entry = gitOut(["ls-tree", commit, "--", file]);
    const match = /^(\d+) blob ([0-9a-f]+)\t/.exec(entry);
    if (!match) throw new PlaywrightSyncInputError(`${file} does not exist in ${commit}.`);
    return { mode: match[1], content: git(["cat-file", "blob", match[2]]).stdout };
}

/** Commits `content` as `file` on top of `parent` without touching HEAD, the index or the working tree. */
function commitFile(parent, file, mode, content) {
    const blob = gitOut(["hash-object", "-w", "--no-filters", "--stdin"], { input: content });
    const indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "playwright-sync-"));
    try {
        const env = { GIT_INDEX_FILE: path.join(indexDir, "index") };
        git(["read-tree", parent], { env });
        git(["update-index", "--cacheinfo", `${mode},${blob},${file}`], { env });
        const tree = gitOut(["write-tree"], { env });
        return gitOut(["commit-tree", tree, "-p", parent, "-m", COMMIT_MESSAGE], { env: BOT_IDENTITY });
    } finally {
        fs.rmSync(indexDir, { recursive: true, force: true });
    }
}

function publish(target) {
    const ref = `refs/heads/${target.source_ref}`;
    const H = target.source_sha;

    // The source ref must still be H before anything is computed from it.
    staleUnlessAt(ref, H, remoteHead(ref));
    const shallow = gitOut(["rev-parse", "--is-shallow-repository"]) === "true";
    git(["fetch", "--no-tags", ...(shallow ? ["--depth=1"] : []), REMOTE, ref]);
    staleUnlessAt(ref, H, gitOut(["rev-parse", "FETCH_HEAD"]));

    const version = authoritativeVersion(readBlob(H, LOCKFILE).content);
    target.required_image = requiredImage(version);
    const dockerfile = readBlob(H, DOCKERFILE);
    const plan = planDockerfileSync(dockerfile.content, version);
    if (!plan.changed) {
        return { outcome: "aligned", detail: `${target.source_ref}@${H} already uses ${target.required_image}.` };
    }

    const C = commitFile(H, DOCKERFILE, dockerfile.mode, plan.content);
    target.result_sha = C;
    console.log(`Prepared ${C} on ${H}: ${DOCKERFILE} v${plan.currentVersion} -> v${version}.`);

    const push = git(
        ["push", "--porcelain", "--no-verify", `--force-with-lease=${ref}:${H}`, REMOTE, `${C}:${ref}`],
        { allowFailure: true },
    );
    const observed = remoteHead(ref);
    if (push.status !== 0 && observed !== C) {
        staleUnlessAt(ref, H, observed);
        const reason = `${push.stdout}\n${push.stderr}`.split("\n").map((l) => l.trim()).filter(Boolean).join(" | ");
        throw new Outcome("failed", `the remote refused to update ${ref} (${reason}); it still points at ${H}.`);
    }
    if (observed !== C) {
        throw new Outcome(
            "failed",
            `git push reported success but ${ref} reads ${
                observed || "(missing)"
            } instead of ${C}; publication is unconfirmed.`,
        );
    }
    return { outcome: "published", detail: `${ref} now points at ${C} (parent ${H}).` };
}

function report(target, outcome, detail) {
    const result = {
        outcome,
        repository: target.repository,
        pr_number: target.pr_number,
        source_ref: target.source_ref,
        source_sha: target.source_sha,
        result_sha: outcome === "published" ? target.result_sha : "",
        required_image: target.required_image ?? "",
        detail,
    };
    const oneLine = (value) => String(value).replace(/[\r\n]+/g, " ");
    if (process.env.GITHUB_OUTPUT) {
        const lines = Object.entries(result).map(([key, value]) => `${key}=${oneLine(value)}`);
        lines.push(`result=${JSON.stringify(result)}`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
    }
    console.log(`playwright-sync-result: ${JSON.stringify(result)}`);
    return result;
}

const { target, refusal } = readTarget(process.env);
if (refusal) {
    report(target, "ineligible", `Verification only: ${refusal}. No branch was updated.`);
    process.exit(0);
}

let outcome, detail;
try {
    ({ outcome, detail } = publish(target));
} catch (err) {
    outcome = err instanceof Outcome ? err.outcome : "failed";
    detail = err instanceof PlaywrightSyncInputError
        ? `unsupported input at ${target.source_sha}: ${err.message}`
        : err.message;
}
report(target, outcome, detail);

if (outcome === "published" || outcome === "aligned") {
    console.log(`${outcome === "published" ? "✅" : "✔️"} ${detail}`);
    process.exit(0);
}

const need = target.required_image
    ? `it must use ${target.required_image}`
    : "its Playwright image could not be determined";
const next = outcome === "stale"
    ? "A run on the new head recomputes the correction; no action is needed unless that run also fails."
    : `Update ${DOCKERFILE} on ${target.source_ref} yourself${
        target.required_image ? ` to FROM ${target.required_image}` : ""
    } and push.`;
console.log(
    `::error title=Playwright image not synchronised::${target.repository}#${target.pr_number} branch ${target.source_ref}: ${need}. `
        + `${outcome}: ${detail} Next step: ${next}`,
);
process.exit(1);
