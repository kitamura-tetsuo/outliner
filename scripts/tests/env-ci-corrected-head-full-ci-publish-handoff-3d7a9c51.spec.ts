import fs from "fs";
import path from "path";
import { afterEach, expect, test } from "vitest";
import {
    checkoutAt,
    dispatchGithub,
    GUARDS,
    HANDOFF,
    handoffResult,
    lifecycleMutations,
    resolveContext,
    runGuards,
    runPlaywrightJob,
    startFake,
} from "./helpers/corrected-head-ci";
import type { FakeGitHub } from "./helpers/fake-github";
import {
    CHECK,
    createFixture,
    DOCKERFILE,
    type Fixture,
    git,
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

/** A full clone at `sha`, like actions/checkout with fetch-depth: 0 (every branch as origin/*). */
function fullCheckout(fx: Fixture, name: string, sha: string) {
    const dir = path.join(fx.tmp, name);
    git(fx.tmp, fx.tmp, "clone", "-q", "--no-checkout", fx.remote, dir);
    git(fx.tmp, dir, "checkout", "-q", "--detach", sha);
    return dir;
}

test("the production publisher's result is handed to full CI on C, with no PR lifecycle calls (AS-001)", async () => {
    const fx = createFixture({
        branch: "dependabot/npm_and_yarn/client/playwright-1.63.0",
        prNumber: 5,
        lock: lockfile("1.63.0"),
        image: "1.62.1",
    });
    fixtures.push(fx);
    const fake = await startFake(fx, { labels: ["dependencies"] });
    fakes.push(fake);

    // The ordinary pull_request run on H.
    const runner = runnerCheckout(fx);
    const github = prEvent(fx, { author: "dependabot[bot]", apiUrl: fake.url, labels: ["dependencies"] });
    const prContext = await resolveContext(fx, github, runner);
    expect(prContext.job.failed, prContext.job.steps.map((s) => s.output).join("")).toBe(false);
    expect(prContext.outputs).toMatchObject({ trigger: "pull_request", head_sha: fx.H, base_ref: "main" });

    const job = await runPlaywrightJob(fx, github, prContext.outputs, runner);
    const publish = job.step(PUBLISH);
    expect(publish.outputs.outcome, publish.output).toBe("published");
    const C = publish.outputs.result_sha;
    expect(remoteRefs(fx)[`refs/heads/${fx.branch}`]).toBe(C);

    const handoff = job.step(HANDOFF);
    expect(handoff.status, handoff.output).toBe(0);
    const result = handoffResult(handoff.output);
    expect(result).toMatchObject({
        outcome: "requested",
        repository: "example/outliner",
        pr_number: "5",
        source_ref: fx.branch,
        head_sha: C,
        verification: "pending",
    });
    // This run checked H, so it still fails: nothing here claims C is verified.
    expect(job.step(CHECK).status).not.toBe(0);
    expect(job.failed).toBe(true);
    expect(JSON.parse(job.outputs.handoff_result)).toMatchObject({ outcome: "requested", head_sha: C });

    // Exactly one outgoing mutation: the dispatch of ci.yml on the source branch.
    expect(lifecycleMutations(fake)).toEqual([]);
    expect(fake.mutations()).toEqual([{
        method: "POST",
        path: "/repos/example/outliner/actions/workflows/ci.yml/dispatches",
        body: { ref: fx.branch, inputs: { pr_number: "5", head_sha: C } },
    }]);
    expect(fake.runs).toHaveLength(1);
    const [run] = fake.runs;
    expect(run).toMatchObject({ event: "workflow_dispatch", head_sha: C, head_branch: fx.branch });
    expect(run.display_title).toBe(`CI: PR #5 corrected head ${C}`);
    expect(result.run_url).toBe(run.html_url);

    // The dispatched run: PR Guards re-validates the claim and restores the PR context.
    const github2 = dispatchGithub(fake, run);
    const atC = checkoutAt(fx, "dispatched", `refs/heads/${fx.branch}`, C);
    const handoffContext = await resolveContext(fx, github2, atC);
    expect(handoffContext.job.failed, handoffContext.job.steps.map((s) => s.output).join("")).toBe(false);
    expect(handoffContext.outputs).toEqual({ ...prContext.outputs, trigger: "handoff", head_sha: C });

    const guards = await runGuards(fx, github2, handoffContext.job, fullCheckout(fx, "guards", C));
    expect(guards.failed, guards.step(GUARDS).output).toBe(false);
    expect(guards.step(GUARDS).output).toMatch(/\[scope\] files=/);
    expect(guards.step(GUARDS).output).toMatch(/\[revert\] no undone base commits/);
    expect(guards.step(GUARDS).output).not.toMatch(/skipped \(no BASE_REF/);

    // The same version job on C: aligned, so it requests nothing and passes.
    const job2 = await runPlaywrightJob(fx, github2, handoffContext.outputs, atC);
    expect(job2.step(PUBLISH).outputs.outcome, job2.step(PUBLISH).output).toBe("aligned");
    expect(job2.step(HANDOFF).skipped).toBe(true);
    expect(job2.step(CHECK).status, job2.step(CHECK).output).toBe(0);
    expect(job2.failed).toBe(false);
    expect(fake.mutations()).toHaveLength(1);
    expect(fs.readFileSync(path.join(atC, DOCKERFILE), "utf-8")).toMatch(/playwright:v1\.63\.0-jammy/);
});
