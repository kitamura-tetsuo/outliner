import fs from "fs";
import path from "path";
import { afterEach, describe, expect, test } from "vitest";
import {
    CHECK,
    createFixture,
    DOCKERFILE,
    dockerfile,
    type Fixture,
    git,
    lockfile,
    MANIFESTS,
    prEvent,
    PUBLISH,
    remoteRefs,
    repoRoot,
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

/** A separate clone of the remote source branch, independent of the runner. */
function observe(fx: Fixture) {
    const dir = path.join(fx.tmp, `observer-${Math.random().toString(36).slice(2)}`);
    git(fx.tmp, fx.tmp, "clone", "-q", "--branch", fx.branch, fx.remote, dir);
    return dir;
}

describe.each([
    {
        who: "Dependabot",
        author: "dependabot[bot]",
        branch: "dependabot/npm_and_yarn/playwright-x",
        pr: 41,
        from: "1.62.1",
        to: "1.63.0",
    },
    { who: "a human", author: "octocat", branch: "feat/bump-playwright", pr: 7, from: "1.58.0", to: "1.59.2" },
])("a same-repository PR by $who", ({ author, branch, pr, from, to }) => {
    test("publishes C = H + the Dockerfile token to the source branch from a detached merge checkout (AS-001)", () => {
        const fx = createFixture({ branch, prNumber: pr, lock: lockfile(to), image: from });
        fixtures.push(fx);
        const runner = runnerCheckout(fx);
        expect(git(fx.tmp, runner, "rev-parse", "--is-shallow-repository")).toBe("true");
        expect(git(fx.tmp, runner, "rev-parse", "--abbrev-ref", "HEAD")).toBe("HEAD");
        const mergeHead = git(fx.tmp, runner, "rev-parse", "HEAD");
        const before = remoteRefs(fx);

        const step = runStep(PUBLISH, runner, prEvent(fx, { author }));
        expect(step.skipped).toBe(false);
        expect(step.status, step.output).toBe(0);

        const obs = observe(fx);
        const C = git(fx.tmp, obs, "rev-parse", "HEAD");
        expect(git(fx.tmp, obs, "rev-list", "--parents", "-n1", C)).toBe(`${C} ${fx.H}`);
        expect(git(fx.tmp, obs, "diff", "--name-only", fx.H, C)).toBe(DOCKERFILE);
        expect(fs.readFileSync(path.join(obs, DOCKERFILE), "utf-8")).toBe(dockerfile(to));
        expect(fs.existsSync(path.join(obs, "BASE_SENTINEL.txt"))).toBe(false);
        expect(git(fx.tmp, obs, "rev-list", C).split("\n")).not.toContain(mergeHead);
        for (const file of MANIFESTS) {
            expect(git(fx.tmp, obs, "rev-parse", `${C}:${file}`)).toBe(
                git(fx.tmp, obs, "rev-parse", `${fx.H}:${file}`),
            );
        }
        expect(remoteRefs(fx)).toEqual({ ...before, [`refs/heads/${branch}`]: C });

        // The emitted identity is the independently observed remote result.
        expect(JSON.parse(step.outputs.result)).toMatchObject({
            outcome: "published",
            repository: "example/outliner",
            pr_number: String(pr),
            source_ref: branch,
            source_sha: fx.H,
            result_sha: C,
        });
        // The runner's checkout was left alone.
        expect(git(fx.tmp, runner, "rev-parse", "HEAD")).toBe(mergeHead);
        expect(git(fx.tmp, runner, "status", "--porcelain")).toBe("");
    });
});

test("an aligned source head, including one just corrected, is a genuine no-op (AS-002)", () => {
    const fx = createFixture({
        branch: "dependabot/npm_and_yarn/pw",
        prNumber: 3,
        lock: lockfile("1.63.0"),
        image: "1.62.1",
    });
    fixtures.push(fx);
    const first = runStep(PUBLISH, runnerCheckout(fx), prEvent(fx));
    expect(first.outputs.outcome, first.output).toBe("published");
    const C = first.outputs.result_sha;

    for (const [name, sha] of [["already-corrected", C], ["corrected-again", C]]) {
        const before = remoteRefs(fx);
        const obsBefore = observe(fx);
        const count = git(fx.tmp, obsBefore, "rev-list", "--count", "HEAD");
        const step = runStep(PUBLISH, runnerCheckout(fx, name), prEvent(fx, { sha }));
        expect(step.status, step.output).toBe(0);
        expect(JSON.parse(step.outputs.result)).toMatchObject({ outcome: "aligned", source_sha: C, result_sha: "" });
        expect(remoteRefs(fx)).toEqual(before);
        const obs = observe(fx);
        expect(git(fx.tmp, obs, "rev-list", "--count", "HEAD")).toBe(count);
        expect(git(fx.tmp, obs, "rev-parse", "HEAD^{tree}")).toBe(git(fx.tmp, obsBefore, "rev-parse", "HEAD^{tree}"));
    }

    // The independent verifier still runs on an aligned checkout and passes.
    const aligned = createFixture({ branch: "feat/aligned", prNumber: 4, lock: lockfile("1.63.0"), image: "1.63.0" });
    fixtures.push(aligned);
    const runner = runnerCheckout(aligned);
    const before = remoteRefs(aligned);
    const step = runStep(PUBLISH, runner, prEvent(aligned));
    expect(step.outputs.outcome, step.output).toBe("aligned");
    expect(step.outputs.source_sha).toBe(aligned.H);
    expect(remoteRefs(aligned)).toEqual(before);
    const check = runStep(CHECK, runner, prEvent(aligned));
    expect(check.status, check.output).toBe(0);
    expect(check.output).toMatch(/Playwright versions agree: image v1\.63\.0/);
});

test("the CI pull_request entry reaches the publisher with PR metadata, not the checkout", () => {
    const ci = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf-8");
    expect(ci).toMatch(/^ {2}pull_request:$/m);
    expect(ci).toMatch(/^ {2}contents: write$/m);
    expect(ci).toMatch(/uses: \.\/\.github\/workflows\/ci-playwright-version\.yml/);
    // The publisher's target is the normalised PR context from PR Guards.
    expect(ci).toMatch(/head_ref: \$\{\{ needs\.pr-guards\.outputs\.head_ref \}\}/);
    expect(ci).toMatch(/head_sha: \$\{\{ needs\.pr-guards\.outputs\.head_sha \}\}/);

    const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci-playwright-version.yml"), "utf-8");
    expect(workflow).toMatch(/PR_HEAD_REF: \$\{\{ inputs\.head_ref \}\}/);
    expect(workflow).toMatch(/PR_HEAD_SHA: \$\{\{ inputs\.head_sha \}\}/);
    expect(workflow).toMatch(/PR_NUMBER: \$\{\{ inputs\.pr_number \}\}/);
    expect(workflow).toMatch(/sync_result: \$\{\{ steps\.publish\.outputs\.result \}\}/);
    expect(workflow).not.toMatch(/git push/);
    expect(workflow).not.toMatch(/sync-playwright-version\.mjs/);
});
