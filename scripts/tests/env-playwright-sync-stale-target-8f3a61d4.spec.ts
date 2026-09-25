import fs from "fs";
import path from "path";
import { afterEach, expect, test } from "vitest";
import {
    commitAll,
    createFixture,
    dockerfile,
    type Fixture,
    git,
    gitShim,
    lockfile,
    prEvent,
    PUBLISH,
    REAL_GIT,
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

const BRANCH = "dependabot/npm_and_yarn/playwright-race";

/**
 * Prepares a second clone whose commit H2 (lockfile 1.64.0 plus an unrelated
 * change) the barrier publishes while the production push is paused.
 */
function contender(fx: Fixture, kind: "advanced" | "divergent") {
    const dir = path.join(fx.tmp, "contender");
    git(fx.tmp, fx.tmp, "clone", "-q", "--branch", BRANCH, fx.remote, dir);
    if (kind === "divergent") git(fx.tmp, dir, "reset", "-q", "--hard", "HEAD~1");
    return commitAll(fx.tmp, dir, "newer update", {
        "client/package-lock.json": lockfile("1.64.0"),
        "UNRELATED.txt": "newer work\n",
    });
}

/**
 * The barrier runs inside the publisher's own `git push`, after it read H and
 * built its correction but before the remote is contacted. It records the
 * remote source SHA before and after it acts, proving the contested ordering.
 */
function barrier(fx: Fixture, action: string) {
    const ref = `refs/heads/${BRANCH}`;
    const seen = path.join(fx.tmp, "barrier.log");
    return {
        script:
            `"${REAL_GIT}" --git-dir "${fx.remote}" rev-parse -q --verify "${ref}" >> "${seen}" || echo none >> "${seen}"\n`
            + `${action}\n`
            + `"${REAL_GIT}" --git-dir "${fx.remote}" rev-parse -q --verify "${ref}" >> "${seen}" || echo none >> "${seen}"`,
        seen: () => fs.readFileSync(seen, "utf-8").trim().split("\n"),
    };
}

test.each(
    [
        ["advanced", "advanced"],
        ["divergent", "divergent"],
        ["deleted", undefined],
    ] as const,
)("a source ref %s during publication wins over the stale correction (AS-003)", (_, kind) => {
    const fx = createFixture({ branch: BRANCH, prNumber: 12, lock: lockfile("1.63.0"), image: "1.62.1" });
    fixtures.push(fx);
    const ref = `refs/heads/${BRANCH}`;
    const H2 = kind ? contender(fx, kind) : "";
    const move = kind
        ? `"${REAL_GIT}" -C "${fx.tmp}/contender" push -q --force origin "HEAD:${ref}"`
        : `"${REAL_GIT}" --git-dir "${fx.remote}" update-ref -d "${ref}"`;
    const gate = barrier(fx, move);
    const shim = gitShim(fx, gate.script);
    const runner = runnerCheckout(fx);
    const others = Object.fromEntries(Object.entries(remoteRefs(fx)).filter(([name]) => name !== ref));

    const step = runStep(PUBLISH, runner, prEvent(fx), { PATH: shim.PATH });

    // The publisher had read H and built its correction on it before the barrier.
    const pushed = shim.pushes();
    const C = /\b([0-9a-f]{40}):refs\/heads\//.exec(pushed)?.[1];
    expect(C, pushed).toBeDefined();
    expect(git(fx.tmp, runner, "rev-parse", `${C}^`)).toBe(fx.H);
    expect(pushed).toContain(`--force-with-lease=${ref}:${fx.H}`);
    expect(gate.seen()).toEqual([fx.H, H2 || "none"]);

    // The newer state stands untouched and the stale correction is not reported as a repair.
    expect(remoteRefs(fx)).toEqual(H2 ? { ...others, [ref]: H2 } : others);
    expect(step.status).not.toBe(0);
    expect(step.outputs).toMatchObject({ outcome: "stale", source_ref: BRANCH, source_sha: fx.H, result_sha: "" });
    expect(step.output).toContain(`branch ${BRANCH}`);
    expect(step.output).toContain("mcr.microsoft.com/playwright:v1.63.0-jammy");
    if (!H2) return;

    // A new invocation on H2 recomputes from H2 alone.
    const again = runStep(PUBLISH, runner, prEvent(fx, { sha: H2 }));
    expect(again.outputs.outcome, again.output).toBe("published");
    const C2 = again.outputs.result_sha;
    expect(remoteRefs(fx)[ref]).toBe(C2);
    expect(git(fx.tmp, `${fx.tmp}/contender`, "fetch", "-q", "origin")).toBe("");
    expect(git(fx.tmp, `${fx.tmp}/contender`, "rev-parse", `${C2}^`)).toBe(H2);
    expect(git(fx.tmp, `${fx.tmp}/contender`, "show", `${C2}:.github/container/Dockerfile`) + "\n").toBe(
        dockerfile("1.64.0"),
    );
});

test("a source ref that moved before the run started is not read or patched", () => {
    const fx = createFixture({ branch: BRANCH, prNumber: 13, lock: lockfile("1.63.0"), image: "1.62.1" });
    fixtures.push(fx);
    const H2 = contender(fx, "advanced");
    git(fx.tmp, `${fx.tmp}/contender`, "push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`);
    const shim = gitShim(fx);
    const before = remoteRefs(fx);

    const step = runStep(PUBLISH, runnerCheckout(fx), prEvent(fx), { PATH: shim.PATH });

    expect(step.outputs.outcome, step.output).toBe("stale");
    expect(step.status).not.toBe(0);
    expect(shim.pushes()).toBe("");
    expect(remoteRefs(fx)).toEqual(before);
    expect(before[`refs/heads/${BRANCH}`]).toBe(H2);
});
