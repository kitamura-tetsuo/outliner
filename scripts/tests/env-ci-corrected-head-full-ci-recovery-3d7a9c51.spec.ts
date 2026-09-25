import fs from "fs";
import { afterEach, expect, test } from "vitest";
import {
    checkoutAt,
    dispatchGithub,
    HANDOFF,
    handoffResult,
    lifecycleMutations,
    resolveContext,
    runPlaywrightJob,
    startFake,
} from "./helpers/corrected-head-ci";
import type { FakeGitHub } from "./helpers/fake-github";
import {
    createFixture,
    type Fixture,
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

/** C published by the real pull_request path, whose full-CI dispatch was denied. */
async function correctedButUnverified() {
    const fx = createFixture({
        branch: "dependabot/npm_and_yarn/pw",
        prNumber: 12,
        lock: lockfile("1.63.0"),
        image: "1.62.1",
    });
    fixtures.push(fx);
    const fake = await startFake(fx);
    fakes.push(fake);
    fake.dispatchMode = "reject";
    const runner = runnerCheckout(fx);
    const github = prEvent(fx, { apiUrl: fake.url });
    const job = await runPlaywrightJob(fx, github, (await resolveContext(fx, github, runner)).outputs, runner);
    const C = job.step(PUBLISH).outputs.result_sha;
    const failed = handoffResult(job.step(HANDOFF).output);
    expect(failed).toMatchObject({ outcome: "scheduling_failed", head_sha: C });
    fake.dispatchMode = "create";
    fake.requests.length = 0;
    return { fx, fake, C, retry: failed.retry as string };
}

/** The documented retry entry: the Corrected-Head CI Handoff workflow, run from main. */
async function retry(fx: Fixture, fake: FakeGitHub, inputs: Record<string, string>) {
    const github = {
        repository: "example/outliner",
        event_name: "workflow_dispatch",
        ref: "refs/heads/main",
        sha: fx.base,
        api_url: fake.url,
        event: { inputs },
        inputs,
    };
    const cwd = checkoutAt(fx, `retry-${Math.random().toString(36).slice(2)}`, "refs/heads/main", fx.base);
    const job = await runJob("ci-corrected-head-handoff.yml", "handoff", { github, inputs }, cwd, {
        ...gitEnv(fx.tmp),
        HANDOFF_POLL_MS: "20",
        HANDOFF_POLL_ATTEMPTS: "5",
    });
    const step = job.step(HANDOFF);
    return { step, result: handoffResult(step.output) };
}

test("the retry entry requests missing full CI for the persisted C without another commit (AS-004)", async () => {
    const { fx, fake, C, retry: entry } = await correctedButUnverified();
    expect(entry).toBe(
        `gh workflow run ci-corrected-head-handoff.yml --repo example/outliner -f pr_number=12 -f head_sha=${C}`,
    );
    const refs = remoteRefs(fx);

    const first = await retry(fx, fake, { pr_number: "12", head_sha: C });
    expect(first.step.status, first.step.output).toBe(0);
    expect(first.result).toMatchObject({
        outcome: "requested",
        head_sha: C,
        source_ref: fx.branch,
        verification: "pending",
    });
    expect(fake.mutations()).toEqual([{
        method: "POST",
        path: "/repos/example/outliner/actions/workflows/ci.yml/dispatches",
        body: { ref: fx.branch, inputs: { pr_number: "12", head_sha: C } },
    }]);
    expect(remoteRefs(fx)).toEqual(refs);

    // Repeating it while that run is queued reuses it.
    const again = await retry(fx, fake, { pr_number: "12" });
    expect(again.result).toMatchObject({ outcome: "reused", head_sha: C, run_id: String(fake.runs[0].id) });
    expect(fake.mutations()).toHaveLength(1);

    // The dispatched run reaches the aligned sync step without dispatching itself again.
    const run = fake.runs[0];
    const github = dispatchGithub(fake, run);
    const atC = checkoutAt(fx, "dispatched", `refs/heads/${fx.branch}`, C);
    const job = await runPlaywrightJob(fx, github, (await resolveContext(fx, github, atC)).outputs, atC);
    expect(job.step(PUBLISH).outputs.outcome).toBe("aligned");
    expect(job.step(HANDOFF).skipped).toBe(true);
    expect(fake.mutations()).toHaveLength(1);

    // A successful evaluation is reused as such.
    run.status = "completed";
    run.conclusion = "success";
    expect((await retry(fx, fake, { pr_number: "12" })).result).toMatchObject({
        outcome: "reused",
        verification: "succeeded",
    });
    expect(fake.mutations()).toHaveLength(1);

    // After a failed evaluation only an explicit retry requests CI again.
    run.conclusion = "failure";
    const rerun = await retry(fx, fake, { pr_number: "12", head_sha: C });
    expect(rerun.result).toMatchObject({ outcome: "requested", verification: "pending" });
    expect(fake.mutations()).toHaveLength(2);
    expect(remoteRefs(fx)).toEqual(refs);
    expect(lifecycleMutations(fake)).toEqual([]);
});

test("the retry entry refuses a head that moved from the one it names, or is not aligned (AS-004)", async () => {
    const { fx, fake, C } = await correctedButUnverified();
    const moved = await retry(fx, fake, { pr_number: "12", head_sha: fx.H });
    expect(moved.step.status).toBe(1);
    expect(moved.result).toMatchObject({ outcome: "stale" });
    expect(moved.result.detail).toContain(`head is ${C}, not the requested ${fx.H}`);

    const other = createFixture({ branch: "feat/unsynced", prNumber: 13, lock: lockfile("1.63.0"), image: "1.62.1" });
    fixtures.push(other);
    const otherFake = await startFake(other);
    fakes.push(otherFake);
    const unaligned = await retry(other, otherFake, { pr_number: "13" });
    expect(unaligned.step.status).toBe(1);
    expect(unaligned.result).toMatchObject({ outcome: "refused", head_sha: other.H });
    expect(unaligned.result.detail).toMatch(/is not aligned yet/);
    expect(fake.mutations()).toEqual([]);
    expect(otherFake.mutations()).toEqual([]);
});
