/**
 * Drives the corrected-head CI handoff through the production workflow graph:
 *
 *   pull_request run for H
 *     -> PR Guards `context` job (normalised PR context)
 *     -> ci.yml `with:` -> ci-playwright-version.yml `playwright-version` job
 *        (publish C to the source branch, then request full CI for C)
 *     -> fake GitHub records the workflow_dispatch and creates a run on the
 *        commit the branch names at that moment
 *   dispatched run for C
 *     -> PR Guards `context` job re-validates the claimed PR/commit
 *     -> PR Guards `pr-guards` job, playwright-version job, ...
 *
 * Only `uses:` steps are stood in for: the test supplies the checkouts.
 */
import fs from "fs";
import path from "path";
import { expect } from "vitest";
import { FakeGitHub, type FakeRun } from "./fake-github";
import { type Fixture, git, gitEnv } from "./playwright-sync-fixture";
import { callInputs, callOutputs, type Context, type JobResult, runJob, type RunJobOptions } from "./workflow-harness";

export const REPO = "example/outliner";
export const HANDOFF = "Request full CI on the corrected head";
export const RESOLVE = "Resolve the pull-request context";
export const GUARDS = "Run PR guards";

export async function startFake(fx: Fixture, opts: { labels?: string[]; headRepo?: string | null; } = {}) {
    const fake = await new FakeGitHub(REPO, fx.remote, gitEnv(fx.tmp)).start();
    fake.pulls.set(fx.prNumber, {
        number: fx.prNumber,
        state: "open",
        headRef: fx.branch,
        headRepo: opts.headRepo === undefined ? REPO : opts.headRepo,
        baseRef: "main",
        labels: opts.labels ?? [],
    });
    return fake;
}

/** The `github` context of the run GitHub starts for a workflow_dispatch. */
export function dispatchGithub(fake: FakeGitHub, run: Pick<FakeRun, "head_branch" | "head_sha" | "inputs">): Context {
    return {
        repository: REPO,
        event_name: "workflow_dispatch",
        actor: "github-actions[bot]",
        ref: `refs/heads/${run.head_branch}`,
        sha: run.head_sha,
        api_url: fake.url,
        event: { inputs: run.inputs ?? {} },
        inputs: run.inputs ?? {},
    };
}

/** A shallow checkout of `sha` fetched through `ref`, as actions/checkout gives a non-PR run. */
export function checkoutAt(fx: Fixture, name: string, ref: string, sha: string, depth = 1): string {
    const dir = path.join(fx.tmp, name);
    git(fx.tmp, fx.tmp, "init", "-q", dir);
    git(fx.tmp, dir, "remote", "add", "origin", fx.remote);
    git(
        fx.tmp,
        dir,
        "fetch",
        "-q",
        "--no-tags",
        ...(depth ? [`--depth=${depth}`] : []),
        "origin",
        `+${ref}:refs/remotes/origin/checkout`,
    );
    git(fx.tmp, dir, "checkout", "-q", "--force", sha);
    return dir;
}

const env = (fx: Fixture) => gitEnv(fx.tmp);
const dispatchInputs = (github: Context) => (github.inputs ?? {}) as Record<string, unknown>;

/** PR Guards' `context` job, fed by ci.yml's `with:`; returns the reusable workflow's outputs. */
export async function resolveContext(fx: Fixture, github: Context, cwd: string) {
    const inputs = callInputs("ci.yml", "pr-guards", { github, inputs: dispatchInputs(github) });
    const job = await runJob("ci-pr-guards.yml", "context", { github, inputs }, cwd, env(fx));
    return { job, outputs: callOutputs("ci-pr-guards.yml", { context: job, "pr-guards": { outputs: {} } }) };
}

/** PR Guards' `pr-guards` job on a checkout of the head it names. */
export async function runGuards(fx: Fixture, github: Context, context: JobResult, cwd: string) {
    const inputs = callInputs("ci.yml", "pr-guards", { github, inputs: dispatchInputs(github) });
    return runJob("ci-pr-guards.yml", "pr-guards", { github, inputs, needs: { context } }, cwd, env(fx));
}

/** ci-playwright-version.yml's job with the inputs ci.yml passes from PR Guards. */
export async function runPlaywrightJob(
    fx: Fixture,
    github: Context,
    prContext: Record<string, string>,
    cwd: string,
    opts: RunJobOptions = {},
) {
    const inputs = callInputs("ci.yml", "playwright-version", {
        github,
        needs: { "pr-guards": { outputs: prContext } },
    });
    return runJob(
        "ci-playwright-version.yml",
        "playwright-version",
        { github, inputs, secrets: { GITHUB_TOKEN: "fake-token" } },
        cwd,
        { ...env(fx), HANDOFF_POLL_MS: "20", HANDOFF_POLL_ATTEMPTS: "5" },
        opts,
    );
}

/** The corrected-head handoff's JSON result line. */
export function handoffResult(output: string) {
    const line = output.split("\n").find((l) => l.startsWith("corrected-head-ci-result: "));
    expect(line, output).toBeDefined();
    return JSON.parse(line!.slice("corrected-head-ci-result: ".length));
}

/** Requests that would close, reopen, merge, edit or push anything besides a workflow dispatch. */
export function lifecycleMutations(fake: FakeGitHub) {
    return fake.mutations().filter((r) => !/\/actions\/workflows\/[^/]+\/dispatches$/.test(r.path));
}

export const read = (file: string) => fs.readFileSync(file, "utf-8");
