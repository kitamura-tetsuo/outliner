import fs from "fs";
import path from "path";
import { afterEach, expect, test } from "vitest";
import {
    CHECK,
    createFixture,
    DOCKERFILE,
    dockerfile,
    type Fixture,
    git,
    gitShim,
    lockfile,
    prEvent,
    PUBLISH,
    remoteRefs,
    runnerCheckout,
    runStep,
} from "./helpers/playwright-sync-fixture";

/** @feature ENV-8f3a61d4
 *  Title   : Playwright image corrections are published to the PR source branch
 *  Source  : docs/dev-features/env-playwright-sync-publishes-source-head-8f3a61d4.yaml
 */

const fixtures: Fixture[] = [];
afterEach(() => {
    for (const fx of fixtures.splice(0)) fs.rmSync(fx.tmp, { recursive: true, force: true });
});

const BRANCH = "dependabot/npm_and_yarn/playwright-guarded";

function fixture(opts: { lock?: string; image?: string; files?: Record<string, string>; } = {}) {
    const fx = createFixture({
        branch: BRANCH,
        prNumber: 21,
        lock: opts.lock ?? lockfile("1.63.0"),
        image: opts.image ?? "1.62.1",
        files: opts.files,
    });
    fixtures.push(fx);
    return fx;
}

test("a rejected push leaves the branch alone and cannot turn the job green (AS-004)", () => {
    const fx = fixture();
    const hook = path.join(fx.remote, "hooks", "pre-receive");
    fs.writeFileSync(hook, "#!/bin/sh\necho 'branch protection: updates are not allowed' >&2\nexit 1\n", {
        mode: 0o755,
    });
    const shim = gitShim(fx);
    const runner = runnerCheckout(fx);
    const before = remoteRefs(fx);

    const publish = runStep(PUBLISH, runner, prEvent(fx), { PATH: shim.PATH });
    const check = runStep(CHECK, runner, prEvent(fx));

    expect(shim.pushes()).toMatch(new RegExp(`^push .*:refs/heads/${BRANCH}$`, "m"));
    expect(remoteRefs(fx)).toEqual(before);
    expect(publish.status).not.toBe(0);
    expect(publish.outputs).toMatchObject({ outcome: "failed", source_ref: BRANCH, source_sha: fx.H, result_sha: "" });
    expect(publish.output).toContain(`branch ${BRANCH}`);
    expect(publish.output).toContain("mcr.microsoft.com/playwright:v1.63.0-jammy");
    expect(publish.output).toContain("branch protection: updates are not allowed");
    expect(publish.output).toMatch(/Next step: Update \.github\/container\/Dockerfile on /);
    // The checkout was never modified, so the independent check still sees the mismatch.
    expect(check.status).not.toBe(0);
    expect(check.output).toMatch(/pinned to playwright v1\.62\.1, but .* resolves @playwright\/test to 1\.63\.0/);
});

test.each([
    ["a pre-release version", { lock: lockfile("1.63.0-beta.1") }, /MAJOR\.MINOR\.PATCH version/],
    ["a missing version", { lock: '{"packages":{}}\n' }, /MAJOR\.MINOR\.PATCH version/],
    ["an unparsable lockfile", { lock: "{" }, /not valid JSON/],
    ["a duplicated FROM line", {
        files: { [DOCKERFILE]: dockerfile("1.62.1").replace(/^(FROM .*)$/m, "$1\n$1") },
    }, /uniquely identifiable/],
    ["a non-jammy FROM line", {
        files: { [DOCKERFILE]: dockerfile("1.62.1").replace("-jammy", "-noble") },
    }, /uniquely identifiable/],
    ["no Playwright FROM line", {
        files: { [DOCKERFILE]: dockerfile("1.62.1").replace(/^FROM .*$/m, "FROM ubuntu:22.04") },
    }, /uniquely identifiable/],
])("%s fails before anything is written (AS-005)", (_, opts, diagnostic) => {
    const fx = fixture(opts);
    const shim = gitShim(fx);
    const runner = runnerCheckout(fx);
    const before = remoteRefs(fx);

    const step = runStep(PUBLISH, runner, prEvent(fx), { PATH: shim.PATH });

    expect(step.status).not.toBe(0);
    expect(step.outputs).toMatchObject({ outcome: "failed", source_sha: fx.H, result_sha: "" });
    expect(step.output).toMatch(diagnostic);
    expect(shim.pushes()).toBe("");
    expect(remoteRefs(fx)).toEqual(before);
    expect(git(fx.tmp, runner, "status", "--porcelain")).toBe("");
});

test.each([
    ["a fork PR with a matching branch name", (fx: Fixture) => prEvent(fx, { headRepo: "someone/outliner" })],
    ["a push event", (fx: Fixture) => ({ ...prEvent(fx), event_name: "push", event: {} })],
    ["a manual dispatch", (fx: Fixture) => ({ ...prEvent(fx), event_name: "workflow_dispatch", event: {} })],
])("%s stays verification-only and still rejects the mismatch (AS-005)", (_, event) => {
    const fx = fixture();
    const shim = gitShim(fx);
    const runner = runnerCheckout(fx);
    const before = remoteRefs(fx);

    const publish = runStep(PUBLISH, runner, event(fx), { PATH: shim.PATH });
    const check = runStep(CHECK, runner, event(fx), { PATH: shim.PATH });

    expect(publish.skipped).toBe(true);
    expect(check.status).not.toBe(0);
    expect(check.output).toMatch(/resolves @playwright\/test to 1\.63\.0/);
    expect(shim.pushes()).toBe("");
    expect(remoteRefs(fx)).toEqual(before);
});

test.each([
    ["a fork head repository", { PR_HEAD_REPOSITORY: "someone/outliner" }],
    ["no head ref", { PR_HEAD_REF: "" }],
    ["no head SHA", { PR_HEAD_SHA: "" }],
])("the publisher itself refuses %s instead of guessing a branch (AS-005)", (_, override) => {
    const fx = fixture();
    const shim = gitShim(fx);
    const runner = runnerCheckout(fx);
    const before = remoteRefs(fx);

    // Invoke the step with overridden metadata, as a misconfigured caller would.
    const step = runStep(PUBLISH, runner, prEvent(fx), { PATH: shim.PATH, ...override });

    expect(step.status, step.output).toBe(0);
    expect(step.outputs.outcome).toBe("ineligible");
    expect(step.outputs.result_sha).toBe("");
    expect(shim.pushes()).toBe("");
    expect(remoteRefs(fx)).toEqual(before);
});
