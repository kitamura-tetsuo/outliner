import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { afterEach, expect, test } from "vitest";
import {
    checkoutAt,
    dispatchGithub,
    handoffResult,
    REPO,
    resolveContext,
    startFake,
} from "./helpers/corrected-head-ci";
import type { FakeGitHub } from "./helpers/fake-github";
import {
    commitAll,
    createFixture,
    type Fixture,
    git,
    gitEnv,
    lockfile,
    runnerCheckout,
} from "./helpers/playwright-sync-fixture";
import { loadWorkflow, repoRoot } from "./helpers/workflow-harness";

/** @feature ENV-3d7a9c51
 *  Title   : A published Playwright correction gets full CI on the corrected head
 *  Source  : docs/dev-features/env-ci-corrected-head-full-ci-3d7a9c51.yaml
 */

const fixtures: Fixture[] = [];
const fakes: FakeGitHub[] = [];
afterEach(async () => {
    for (const fake of fakes.splice(0)) await fake.stop();
    for (const fx of fixtures.splice(0)) fs.rmSync(fx.tmp, { recursive: true, force: true });
});

async function setup() {
    const fx = createFixture({ branch: "feat/pw", prNumber: 41, lock: lockfile("1.63.0"), image: "1.63.0" });
    fixtures.push(fx);
    const fake = await startFake(fx);
    fakes.push(fake);
    return { fx, fake, cwd: checkoutAt(fx, "head", `refs/heads/${fx.branch}`, fx.H) };
}

test("a handoff dispatch whose claim does not match the PR record fails before any check (AS-006)", async () => {
    const { fx, fake, cwd } = await setup();
    const cases: [string, Record<string, string>, string, (f: FakeGitHub) => void, RegExp][] = [
        [
            "a commit without a PR number",
            { head_sha: fx.H },
            fx.branch,
            () => {},
            /pr_number "" is not a pull-request number/,
        ],
        [
            "a non-numeric PR number",
            { pr_number: "41; gh pr close 41", head_sha: fx.H },
            fx.branch,
            () => {},
            /is not a pull-request number/,
        ],
        [
            "a short commit id",
            { pr_number: "41", head_sha: fx.H.slice(0, 7) },
            fx.branch,
            () => {},
            /is not a full commit id/,
        ],
        [
            "a commit other than the dispatched one",
            { pr_number: "41", head_sha: fx.base },
            fx.branch,
            () => {},
            /branch moved before the run started/,
        ],
        [
            "a branch that is not the PR's",
            { pr_number: "41", head_sha: fx.base },
            "main",
            () => {},
            /has source branch "feat\/pw", not "main"/,
        ],
        ["an unknown PR", { pr_number: "999", head_sha: fx.H }, fx.branch, () => {}, /HTTP 404/],
        [
            "a fork PR",
            { pr_number: "41", head_sha: fx.H },
            fx.branch,
            (f) => (f.pulls.get(41)!.headRepo = "someone/outliner"),
            /comes from someone\/outliner/,
        ],
        ["a closed PR", { pr_number: "41", head_sha: fx.H }, fx.branch, (f) => {
            f.pulls.get(41)!.headRepo = REPO;
            f.pulls.get(41)!.state = "closed";
        }, /is closed, not open/],
    ];
    for (const [name, inputs, ref, arrange, reason] of cases) {
        arrange(fake);
        const sha = ref === "main" ? fx.base : fx.H;
        const context = await resolveContext(
            fx,
            dispatchGithub(fake, { head_branch: ref, head_sha: sha, inputs }),
            cwd,
        );
        const output = context.job.steps.map((s) => s.output).join("");
        expect(context.job.failed, name).toBe(true);
        expect(output, name).toMatch(reason);
        expect(output, name).toContain("::error title=Corrected-head CI target rejected::");
        expect(context.outputs, name).toMatchObject({ trigger: "", pr_number: "", head_sha: "", base_ref: "" });
    }
    expect(fake.mutations()).toEqual([]);
});

/** The sender itself, run the way the workflow step runs it, for results the publisher never emits. */
function sender(cwd: string, env: Record<string, string>) {
    return new Promise<{ status: number | null; output: string; }>((resolve) => {
        const child = spawn("node", ["scripts/ci/request-corrected-head-ci.mjs"], {
            cwd,
            env: { ...process.env, ...env },
        });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (status) => resolve({ status, output }));
    });
}

test("only a confirmed Dockerfile-token publication, for a same-repository PR, is handed off (AS-006)", async () => {
    const fx = createFixture({ branch: "feat/pw2", prNumber: 42, lock: lockfile("1.63.0"), image: "1.62.1" });
    fixtures.push(fx);
    const fake = await startFake(fx);
    fakes.push(fake);
    const runner = runnerCheckout(fx);
    // A child of H that changes more than the Dockerfile token, published to the branch.
    const seed = path.join(fx.tmp, "tamper");
    git(fx.tmp, fx.tmp, "clone", "-q", "--branch", fx.branch, fx.remote, seed);
    const X = commitAll(fx.tmp, seed, "not a sync", { "client/package.json": '{\n    "name": "evil"\n}\n' });
    git(fx.tmp, seed, "push", "-q", "origin", `HEAD:refs/heads/${fx.branch}`);
    git(fx.tmp, runner, "fetch", "-q", "origin", fx.branch);

    const base = { repository: REPO, pr_number: "42", source_ref: fx.branch, source_sha: fx.H, result_sha: X };
    const env = { ...gitEnv(fx.tmp), GITHUB_API_URL: fake.url, GH_TOKEN: "t", HANDOFF_POLL_MS: "10" } as Record<
        string,
        string
    >;
    for (
        const [result, reason] of [
            [{ ...base, outcome: "aligned" }, /reported "aligned", not a confirmed publication/],
            [{ ...base, outcome: "stale" }, /reported "stale"/],
            [{ ...base, outcome: "published", result_sha: "" }, /lacks a valid repository/],
            [{ ...base, outcome: "published" }, /is not the Playwright version-token correction/],
        ] as const
    ) {
        const r = await sender(runner, { ...env, SYNC_RESULT: JSON.stringify(result) });
        expect(r.status, r.output).toBe(1);
        expect(handoffResult(r.output).outcome).toBe("refused");
        expect(r.output).toMatch(reason);
    }
    expect(fake.requests).toEqual([]);
});

test("CI runs one full graph for every entry point, gated by PR Guards (REQ-003, REQ-008)", () => {
    const ci = loadWorkflow("ci.yml");
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(["workflow_dispatch", "push", "pull_request"]));
    expect(Object.keys(ci.on.workflow_dispatch.inputs)).toEqual(["pr_number", "head_sha"]);
    expect(ci.permissions).toMatchObject({ actions: "write", contents: "write" });
    const jobs = ci.jobs as Record<string, { needs?: string | string[]; if?: string; uses: string; }>;
    expect(Object.keys(jobs).sort()).toEqual([
        "checks",
        "docker-build",
        "e2e-test",
        "eslint-client",
        "format",
        "integration-test",
        "lint-diff-lines",
        "playwright-version",
        "pr-guards",
        "server-test",
        "unit-test",
        "yaml-tests-check",
    ]);
    for (const [name, job] of Object.entries(jobs)) {
        if (name !== "pr-guards") expect([job.needs].flat(), name).toContain("pr-guards");
        // No job is conditional on how the run was triggered.
        expect(JSON.stringify(job), name).not.toMatch(/event_name|github\.event\.|github\.base_ref|github\.head_ref/);
    }
    for (const name of ["unit-test", "integration-test", "server-test", "e2e-test"]) {
        expect([jobs[name].needs].flat(), name).toEqual(["pr-guards", "format", "eslint-client"]);
    }
    // PR Guards' guard job waits for, and only gets its PR data from, the validated context.
    const guards = loadWorkflow("ci-pr-guards.yml").jobs["pr-guards"];
    expect(guards.needs).toBe("context");
    expect(JSON.stringify(guards)).not.toMatch(/github\.event|github\.base_ref/);
    // The e2e matrix does not depend on the event.
    expect(JSON.stringify(loadWorkflow("ci-test-e2e.yml").jobs["e2e-test"].strategy)).not.toMatch(/github/);
});

test("nothing on the CI or handoff path closes, reopens or merges a PR (REQ-008)", () => {
    const dir = path.join(repoRoot, ".github", "workflows");
    const onPath = [
        "ci.yml",
        "ci-corrected-head-handoff.yml",
        ...fs.readdirSync(dir).filter((f) => /^ci-.*\.yml$/.test(f)),
    ];
    for (const file of new Set(onPath)) {
        expect(fs.readFileSync(path.join(dir, file), "utf-8"), file).not.toMatch(
            /gh pr (close|reopen|merge)|\/merge"|pulls\/[^ ]*\/merge/,
        );
    }
    for (
        const file of [
            "scripts/ci/request-corrected-head-ci.mjs",
            "scripts/ci/resolve-pr-context.mjs",
            "scripts/ci/github-rest.mjs",
        ]
    ) {
        const src = fs.readFileSync(path.join(repoRoot, file), "utf-8");
        expect(src, file).not.toMatch(/"(PATCH|PUT|DELETE)"|gh pr |git push/);
    }
});
