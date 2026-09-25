import fs from "fs";
import { afterEach, expect, test } from "vitest";
import {
    HANDOFF,
    handoffResult,
    lifecycleMutations,
    resolveContext,
    runPlaywrightJob,
    startFake,
} from "./helpers/corrected-head-ci";
import type { DispatchMode, FakeGitHub } from "./helpers/fake-github";
import {
    createFixture,
    type Fixture,
    lockfile,
    prEvent,
    PUBLISH,
    remoteRefs,
    runnerCheckout,
} from "./helpers/playwright-sync-fixture";

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

/** Runs the real pull_request path up to the handoff, after `arrange` prepared the fake. */
async function publishAndHandOff(
    mode: DispatchMode,
    arrange: (fake: FakeGitHub, fx: Fixture, C: () => string) => void = () => {},
) {
    const fx = createFixture({
        branch: "feat/bump-playwright",
        prNumber: 9,
        lock: lockfile("1.63.0"),
        image: "1.62.1",
    });
    fixtures.push(fx);
    const fake = await startFake(fx);
    fakes.push(fake);
    fake.dispatchMode = mode;
    const runner = runnerCheckout(fx);
    const github = prEvent(fx, { apiUrl: fake.url });
    const ctx = await resolveContext(fx, github, runner);
    // Runs the fake would list once C exists (before the first run lookup).
    let armed = false;
    fake.beforeRequest = (req) => {
        if (!armed && req.path.includes("/actions/workflows/")) {
            armed = true;
            arrange(fake, fx, () => remoteRefs(fx)[`refs/heads/${fx.branch}`]);
        }
    };
    const job = await runPlaywrightJob(fx, github, ctx.outputs, runner);
    const C = job.step(PUBLISH).outputs.result_sha;
    expect(C, job.step(PUBLISH).output).toMatch(/^[0-9a-f]{40}$/);
    return { fx, fake, job, C, handoff: job.step(HANDOFF) };
}

function expectSchedulingFailure(h: Awaited<ReturnType<typeof publishAndHandOff>>, reason: RegExp) {
    const { fx, fake, C, handoff } = h;
    expect(handoff.status, handoff.output).toBe(1);
    const result = handoffResult(handoff.output);
    expect(result).toMatchObject({ outcome: "scheduling_failed", head_sha: C, source_ref: fx.branch, pr_number: "9" });
    expect(result.verification).not.toBe("succeeded");
    expect(result.detail).toMatch(reason);
    // The accepted correction stays; the diagnostic names the target and a retry entry.
    expect(remoteRefs(fx)[`refs/heads/${fx.branch}`]).toBe(C);
    expect(result.retry).toBe(
        `gh workflow run ci-corrected-head-handoff.yml --repo example/outliner -f pr_number=9 -f head_sha=${C}`,
    );
    expect(handoff.output).toContain(
        `::error title=Full CI not scheduled for the corrected head::example/outliner#9 branch ${fx.branch} at ${C}`,
    );
    expect(handoff.output).toContain(`Retry with: ${result.retry}`);
    expect(h.job.failed).toBe(true);
    expect(lifecycleMutations(fake)).toEqual([]);
}

test("a denied dispatch leaves C in place and prints the retry entry (AS-003)", async () => {
    expectSchedulingFailure(await publishAndHandOff("reject"), /dispatch was rejected: .*HTTP 403/);
});

test("a run that only waits for approval is not verification (AS-003)", async () => {
    const h = await publishAndHandOff("approval");
    expect(h.fake.runs).toHaveLength(1);
    expectSchedulingFailure(h, /waiting for approval/);
});

test("an acknowledged dispatch with no observable run is not verification (AS-003)", async () => {
    const h = await publishAndHandOff("silent");
    expect(h.fake.mutations()).toHaveLength(1);
    expectSchedulingFailure(h, /no full-CI run for .* appeared/);
});

test("green runs on the old head, other PRs, the standalone checker or a plain dispatch are not reused (AS-003)", async () => {
    const h = await publishAndHandOff("create", (fake, fx, C) => {
        const c = C();
        fake.addRun({
            event: "pull_request",
            head_sha: fx.H,
            status: "completed",
            conclusion: "success",
            pull_requests: [{ number: 9 }],
        });
        fake.addRun({ event: "push", head_sha: c, status: "completed", conclusion: "success", head_branch: "main" });
        fake.addRun({
            event: "pull_request",
            head_sha: c,
            status: "completed",
            conclusion: "success",
            pull_requests: [{ number: 10 }],
        });
        fake.addRun({
            workflow: "ci-playwright-version.yml",
            event: "workflow_dispatch",
            head_sha: c,
            status: "completed",
            conclusion: "success",
            head_branch: fx.branch,
            display_title: `CI: PR #9 corrected head ${c}`,
        });
        fake.addRun({
            event: "workflow_dispatch",
            head_sha: c,
            status: "completed",
            conclusion: "success",
            head_branch: fx.branch,
            display_title: "CI",
        });
        fake.addRun({
            event: "pull_request",
            head_sha: c,
            status: "completed",
            conclusion: "action_required",
            pull_requests: [{ number: 9 }],
        });
    });
    expect(h.handoff.status, h.handoff.output).toBe(0);
    const result = handoffResult(h.handoff.output);
    expect(result).toMatchObject({ outcome: "requested", verification: "pending", head_sha: h.C });
    const created = h.fake.runs.at(-1)!;
    expect(result.run_id).toBe(String(created.id));
    expect(created.display_title).toBe(`CI: PR #9 corrected head ${h.C}`);
    expect(h.fake.mutations()).toHaveLength(1);
});
