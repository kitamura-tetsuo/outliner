import fs from "fs";
import { afterEach, expect, test } from "vitest";
import { HANDOFF, handoffResult, resolveContext, runPlaywrightJob, startFake } from "./helpers/corrected-head-ci";
import type { FakeGitHub } from "./helpers/fake-github";
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

async function setup(prNumber: number) {
    const fx = createFixture({ branch: `feat/lag-${prNumber}`, prNumber, lock: lockfile("1.63.0"), image: "1.62.1" });
    fixtures.push(fx);
    const fake = await startFake(fx);
    fakes.push(fake);
    const runner = runnerCheckout(fx);
    const github = prEvent(fx, { apiUrl: fake.url });
    const ctx = await resolveContext(fx, github, runner);
    return { fx, fake, runner, github, ctx: ctx.outputs };
}

test("a PR record that still lags the push is waited for, not treated as stale", async () => {
    const { fx, fake, runner, github, ctx } = await setup(25);
    fake.pulls.get(25)!.headSha = fx.H;
    let prReads = 0;
    fake.beforeRequest = (r) => {
        if (r.path.endsWith("/pulls/25") && ++prReads === 2) delete fake.pulls.get(25)!.headSha;
    };
    const job = await runPlaywrightJob(fx, github, ctx, runner);
    expect(handoffResult(job.step(HANDOFF).output)).toMatchObject({ outcome: "requested" });
    expect(prReads).toBeGreaterThanOrEqual(3);
});

test("a PR record that lags past the polling window is a scheduling failure with the retry entry", async () => {
    const { fx, fake, runner, github, ctx } = await setup(26);
    fake.pulls.get(26)!.headSha = fx.H;
    const job = await runPlaywrightJob(fx, github, ctx, runner, {
        stepEnv: { [HANDOFF]: { HANDOFF_POLL_ATTEMPTS: "3", HANDOFF_POLL_MS: "10" } },
    });
    const C = job.step(PUBLISH).outputs.result_sha;
    const handoff = job.step(HANDOFF);
    expect(handoff.status).toBe(1);
    const result = handoffResult(handoff.output);
    const retry =
        `gh workflow run ci-corrected-head-handoff.yml --repo example/outliner -f pr_number=26 -f head_sha=${C}`;
    expect(result).toMatchObject({
        outcome: "scheduling_failed",
        head_sha: C,
        source_ref: fx.branch,
        retry,
        verification: "not-started",
    });
    expect(result.detail).toContain(`head is ${fx.H}, not ${C}`);
    expect(handoff.output).toContain(`Retry with: ${retry}`);
    expect(handoff.output).not.toContain("Nothing was requested");
    expect(remoteRefs(fx)[`refs/heads/${fx.branch}`]).toBe(C);
    expect(fake.mutations()).toEqual([]);
});
