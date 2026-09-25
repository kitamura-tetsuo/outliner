import fs from "fs";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";
import { dispatchGithub, GUARDS, REPO, resolveContext, runGuards } from "./helpers/corrected-head-ci";
import { FakeGitHub } from "./helpers/fake-github";
import { commitAll, type Fixture, git, gitEnv, makeTmp, repoRoot } from "./helpers/playwright-sync-fixture";

/** @feature ENV-3d7a9c51
 *  Title   : A published Playwright correction gets full CI on the corrected head
 *  Source  : docs/dev-features/env-ci-corrected-head-full-ci-3d7a9c51.yaml
 */

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
    for (const fn of cleanup.splice(0).reverse()) await fn();
});

const SCRIPTS = ["scripts/ci/github-rest.mjs", "scripts/ci/pr-guards.sh", "scripts/ci/resolve-pr-context.mjs"];

type Shape = "scope" | "revert" | "normal";

/** A remote whose main has a feature commit, and a PR branch of the given shape. */
function guardFixture(shape: Shape, prNumber: number): Fixture {
    const tmp = makeTmp();
    const remote = path.join(tmp, "remote.git");
    const seed = path.join(tmp, "seed");
    git(tmp, tmp, "init", "-q", "--bare", remote);
    git(tmp, tmp, "init", "-q", seed);
    git(tmp, seed, "remote", "add", "origin", remote);
    commitAll(
        tmp,
        seed,
        "base",
        Object.fromEntries(SCRIPTS.map((f) => [f, fs.readFileSync(path.join(repoRoot, f), "utf-8")])),
    );
    commitAll(tmp, seed, "add feature", { "src/feature.ts": "export const feature = 1;\n" });
    const branch = `topic/${shape}`;
    git(tmp, seed, "checkout", "-q", "-b", branch);
    const files: Record<string, string | undefined> = shape === "scope"
        ? Object.fromEntries(
            Array.from({ length: 60 }, (_, i) => [`src/generated/g${i}.ts`, `export const g${i} = ${i};\n`]),
        )
        : shape === "revert"
        ? { "src/feature.ts": undefined, "src/other.ts": "export const other = 2;\n" }
        : { "src/other.ts": "export const other = 2;\n" };
    const H = commitAll(tmp, seed, `pr: ${shape}`, files);
    git(tmp, seed, "checkout", "-q", "main");
    const base = commitAll(tmp, seed, "later base work", { "src/later.ts": "export const later = 3;\n" });
    git(tmp, seed, "push", "-q", "origin", "main", branch);
    const fx = { tmp, remote, seed, branch, prNumber, H, base, merge: H };
    cleanup.push(() => fs.rmSync(tmp, { recursive: true, force: true }));
    return fx;
}

/** actions/checkout of `sha` with fetch-depth: 0. */
function fullCheckout(fx: Fixture, name: string) {
    const dir = path.join(fx.tmp, name);
    git(fx.tmp, fx.tmp, "clone", "-q", "--no-checkout", fx.remote, dir);
    git(fx.tmp, dir, "checkout", "-q", "--detach", fx.H);
    return dir;
}

async function bothPaths(shape: Shape, labels: string[]) {
    const fx = guardFixture(shape, 31);
    const fake = await new FakeGitHub(REPO, fx.remote, gitEnv(fx.tmp)).start();
    cleanup.push(() => fake.stop());
    // Label order differs between the webhook and the API; the normalised context must not.
    fake.pulls.set(31, {
        number: 31,
        state: "open",
        headRef: fx.branch,
        headRepo: REPO,
        baseRef: "main",
        labels: [...labels].reverse(),
    });

    const prGithub = {
        repository: REPO,
        event_name: "pull_request",
        ref: "refs/pull/31/merge",
        sha: fx.H,
        api_url: fake.url,
        event: {
            pull_request: {
                number: 31,
                head: { ref: fx.branch, sha: fx.H, repo: { full_name: REPO } },
                base: { ref: "main", sha: fx.base },
                labels: labels.map((name) => ({ name })),
            },
        },
    };
    const handoffGithub = dispatchGithub(fake, {
        head_branch: fx.branch,
        head_sha: fx.H,
        inputs: { pr_number: "31", head_sha: fx.H },
    });

    const out = [];
    for (const [name, github] of [["pull_request", prGithub], ["handoff", handoffGithub]] as const) {
        const cwd = fullCheckout(fx, name);
        const context = await resolveContext(fx, github, cwd);
        expect(context.job.failed, context.job.steps.map((s) => s.output).join("")).toBe(false);
        const guards = await runGuards(fx, github, context.job, cwd);
        out.push({ context: context.outputs, guards: guards.step(GUARDS), failed: guards.failed });
    }
    const [pr, handoff] = out;
    expect(handoff.context).toEqual({ ...pr.context, trigger: "handoff" });
    expect(pr.context).toMatchObject({
        trigger: "pull_request",
        head_sha: fx.H,
        base_ref: "main",
        base_sha: fx.base,
        labels: [...labels].sort().join(" "),
    });
    expect(handoff.guards.status).toBe(pr.guards.status);
    expect(handoff.guards.output).toBe(pr.guards.output);
    expect(handoff.guards.output).not.toMatch(/skipped \(no BASE_REF/);
    expect(fake.mutations()).toEqual([]);
    return handoff;
}

describe("a handoff dispatch reaches the same PR guard decisions as the pull_request run (AS-002)", () => {
    test("an oversized diff is rejected by the scope guard on both paths", async () => {
        const r = await bothPaths("scope", []);
        expect(r.failed).toBe(true);
        expect(r.guards.output).toMatch(/::error::\[scope\] PR diff is anomalously large \(60 files/);
    });

    test("the allow-large-diff label passes it on both paths", async () => {
        const r = await bothPaths("scope", ["dependencies", "allow-large-diff"]);
        expect(r.failed).toBe(false);
        expect(r.guards.output).toMatch(/'allow-large-diff' label is set -- allowed/);
    });

    test("an undone base commit is rejected by the revert guard on both paths", async () => {
        const r = await bothPaths("revert", []);
        expect(r.failed).toBe(true);
        expect(r.guards.output).toMatch(/::error::\[revert\] PR head has UNDONE base commit .* add feature/);
    });

    test("the allow-revert label passes it on both paths", async () => {
        const r = await bothPaths("revert", ["allow-revert"]);
        expect(r.failed).toBe(false);
        expect(r.guards.output).toMatch(/'allow-revert' label is set -- allowed/);
    });

    test("an ordinary PR passes on both paths", async () => {
        const r = await bothPaths("normal", []);
        expect(r.failed).toBe(false);
        expect(r.guards.output).toMatch(/\[scope\] files=1 .*\n.*\[revert\] no undone base commits/s);
    });
});

test("push and plain manual runs keep the push-build guard behaviour and no PR context (REQ-008)", async () => {
    const fx = guardFixture("scope", 32);
    for (
        const github of [
            {
                repository: REPO,
                event_name: "push",
                ref: "refs/heads/main",
                sha: fx.H,
                api_url: "http://127.0.0.1:9",
                event: {},
            },
            {
                repository: REPO,
                event_name: "workflow_dispatch",
                ref: `refs/heads/${fx.branch}`,
                sha: fx.H,
                api_url: "http://127.0.0.1:9",
                event: { inputs: {} },
                inputs: {},
            },
        ]
    ) {
        const cwd = fullCheckout(fx, `plain-${github.event_name}`);
        const context = await resolveContext(fx, github, cwd);
        expect(context.outputs).toMatchObject({
            trigger: "none",
            pr_number: "",
            head_sha: "",
            base_ref: "",
            labels: "",
        });
        const guards = await runGuards(fx, github, context.job, cwd);
        expect(guards.failed).toBe(false);
        expect(guards.step(GUARDS).output).toMatch(/\[scope\]\/\[revert\] skipped \(no BASE_REF; push build\)/);
    }
});
