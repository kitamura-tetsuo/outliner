import fs from "fs";
import path from "path";
import { afterEach, expect, test } from "vitest";
import {
    checkoutAt,
    dispatchGithub,
    HANDOFF,
    handoffResult,
    resolveContext,
    runPlaywrightJob,
    startFake,
} from "./helpers/corrected-head-ci";
import type { FakeGitHub, RecordedRequest } from "./helpers/fake-github";
import {
    commitAll,
    createFixture,
    type Fixture,
    git,
    gitEnv,
    lockfile,
    prEvent,
    PUBLISH,
    remoteRefs,
    runnerCheckout,
} from "./helpers/playwright-sync-fixture";
import { runJob } from "./helpers/workflow-harness";

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

async function setup(prNumber: number) {
    const fx = createFixture({ branch: `feat/pw-${prNumber}`, prNumber, lock: lockfile("1.63.0"), image: "1.62.1" });
    fixtures.push(fx);
    const fake = await startFake(fx);
    fakes.push(fake);
    const runner = runnerCheckout(fx);
    const github = prEvent(fx, { apiUrl: fake.url });
    const ctx = await resolveContext(fx, github, runner);
    return { fx, fake, runner, github, ctx: ctx.outputs };
}

/** A second actor pushes D (= current head + an unrelated file) to the source branch. */
function pushD(fx: Fixture) {
    const dir = path.join(fx.tmp, `actor-${Math.random().toString(36).slice(2)}`);
    git(fx.tmp, fx.tmp, "clone", "-q", "--branch", fx.branch, fx.remote, dir);
    const D = commitAll(fx.tmp, dir, "second actor", { "notes.txt": "newer work\n" });
    git(fx.tmp, dir, "push", "-q", "origin", `HEAD:refs/heads/${fx.branch}`);
    return D;
}

/** Holds the handoff at its `n`-th request matching `match`, runs `act`, then lets it continue. */
function barrier(fake: FakeGitHub, match: (r: RecordedRequest) => boolean, act: () => void, n = 1) {
    let seen = 0;
    fake.beforeRequest = (r) => {
        if (match(r) && ++seen === n) act();
    };
}
const isRunList = (r: RecordedRequest) => r.method === "GET" && /\/actions\/workflows\/ci\.yml\/runs/.test(r.path);
const isDispatch = (r: RecordedRequest) => r.method === "POST";

test("D pushed just before acceptance refuses C's handoff and leaves D alone (AS-005)", async () => {
    const { fx, fake, runner, github, ctx } = await setup(21);
    let D = "";
    barrier(fake, isRunList, () => (D = pushD(fx)));
    const job = await runPlaywrightJob(fx, github, ctx, runner);
    const C = job.step(PUBLISH).outputs.result_sha;
    const handoff = job.step(HANDOFF);
    expect(handoff.status).toBe(1);
    expect(handoffResult(handoff.output)).toMatchObject({
        outcome: "stale",
        head_sha: C,
        retry: "",
        verification: "not-started",
    });
    expect(handoff.output).toContain(`head is ${D}, not ${C}`);
    expect(git(fx.tmp, fx.tmp, "--git-dir", fx.remote, "rev-parse", `${D}^`)).toBe(C);
    expect(remoteRefs(fx)[`refs/heads/${fx.branch}`]).toBe(D);
    expect(fake.mutations()).toEqual([]);
    expect(fake.runs).toEqual([]);
});

test("a PR closed just before acceptance gets no handoff (AS-005)", async () => {
    const { fx, fake, runner, github, ctx } = await setup(22);
    barrier(fake, isRunList, () => (fake.pulls.get(22)!.state = "closed"));
    const job = await runPlaywrightJob(fx, github, ctx, runner);
    const handoff = job.step(HANDOFF);
    expect(handoff.status).toBe(1);
    expect(handoffResult(handoff.output)).toMatchObject({ outcome: "refused" });
    expect(handoff.output).toContain("example/outliner#22 is closed, not open.");
    expect(fake.mutations()).toEqual([]);
});

test("D landing between the last check and the dispatch gets a run that rejects C's claim (AS-005)", async () => {
    const { fx, fake, runner, github, ctx } = await setup(23);
    let D = "";
    barrier(fake, isDispatch, () => (D = pushD(fx)));
    const job = await runPlaywrightJob(fx, github, ctx, runner);
    const C = job.step(PUBLISH).outputs.result_sha;
    expect(handoffResult(job.step(HANDOFF).output)).toMatchObject({ outcome: "stale", head_sha: C });

    // GitHub started the run on D, still carrying C's claim: PR Guards refuses it.
    const [run] = fake.runs;
    expect(run).toMatchObject({ head_sha: D, inputs: { pr_number: "23", head_sha: C } });
    const context = await resolveContext(
        fx,
        dispatchGithub(fake, run),
        checkoutAt(fx, "on-d", `refs/heads/${fx.branch}`, D),
    );
    const resolve = context.job.steps.find((s) => !s.skipped)!;
    expect(context.job.failed).toBe(true);
    expect(resolve.output).toContain(`the run was dispatched on ${fx.branch}@${D}, but the handoff names ${C}`);
    expect(context.outputs.head_sha).toBe("");
    expect(remoteRefs(fx)[`refs/heads/${fx.branch}`]).toBe(D);
});

test("C's successful evaluation never verifies a newer head D (AS-005)", async () => {
    const { fx, fake, runner, github, ctx } = await setup(24);
    const job = await runPlaywrightJob(fx, github, ctx, runner);
    const C = job.step(PUBLISH).outputs.result_sha;
    const [cRun] = fake.runs;
    expect(cRun.head_sha).toBe(C);

    // C's run has started; D becomes current; then C's run succeeds.
    const D = pushD(fx);
    cRun.status = "completed";
    cRun.conclusion = "success";

    // D's own verification is requested afresh, for D, not satisfied by C's run.
    const inputs = { pr_number: "24" };
    const retryGithub = {
        repository: "example/outliner",
        event_name: "workflow_dispatch",
        ref: "refs/heads/main",
        sha: fx.base,
        api_url: fake.url,
        event: { inputs },
        inputs,
    };
    const retry = await runJob(
        "ci-corrected-head-handoff.yml",
        "handoff",
        { github: retryGithub, inputs },
        checkoutAt(fx, "retry", "refs/heads/main", fx.base),
        {
            ...gitEnv(fx.tmp),
            HANDOFF_POLL_MS: "20",
        },
    );
    const result = handoffResult(retry.step(HANDOFF).output);
    expect(result).toMatchObject({ outcome: "requested", head_sha: D, verification: "pending" });
    expect(result.run_id).not.toBe(String(cRun.id));
    expect(fake.runs.at(-1)).toMatchObject({ head_sha: D, display_title: `CI: PR #24 corrected head ${D}` });

    // And a handoff that still claims C is refused outright.
    const stale = await runJob(
        "ci-corrected-head-handoff.yml",
        "handoff",
        { github: retryGithub, inputs: { pr_number: "24", head_sha: C } },
        checkoutAt(fx, "retry2", "refs/heads/main", fx.base),
        gitEnv(fx.tmp),
    );
    expect(handoffResult(stale.step(HANDOFF).output)).toMatchObject({ outcome: "stale" });
});
