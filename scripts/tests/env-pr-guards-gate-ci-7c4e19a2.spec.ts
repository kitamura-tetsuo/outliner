import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-7c4e19a2
 *  Title   : PR guards gate every other CI job
 *  Source  : docs/dev-features/env-pr-guards-gate-ci-7c4e19a2.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf-8");

const jobBlock = (job: string) => {
    const start = workflow.indexOf(`  ${job}:`);
    expect(start, `${job} must exist`).toBeGreaterThanOrEqual(0);
    const nextJob = /^  [a-z][a-z0-9-]*:\s*$/gm;
    nextJob.lastIndex = start + job.length + 3;
    return workflow.slice(start, nextJob.exec(workflow)?.index);
};

test("PR guards execute the repository guard script before CI is released", () => {
    const guardWorkflow = fs.readFileSync(
        path.join(repoRoot, ".github/workflows/ci-pr-guards.yml"),
        "utf-8",
    );

    expect(jobBlock("pr-guards")).not.toMatch(/\bneeds:/);
    expect(jobBlock("pr-guards")).toMatch(/uses: \.\/\.github\/workflows\/ci-pr-guards\.yml/);
    expect(guardWorkflow).toMatch(/run: bash scripts\/ci\/pr-guards\.sh/);
});

test("every other CI job waits directly for PR guards", () => {
    const gatedJobs = [
        "format",
        "checks",
        "unit-test",
        "integration-test",
        "server-test",
        "e2e-test",
        "docker-build",
        "eslint-client",
        "yaml-tests-check",
        "lint-diff-lines",
        "playwright-version",
    ];

    for (const job of gatedJobs) {
        expect(jobBlock(job), `${job} must wait for PR guards`).toMatch(
            /needs: (?:pr-guards|\[[^\]]*\bpr-guards\b[^\]]*\])/,
        );
    }
});

test("test and build jobs do not override a failed guard with always()", () => {
    for (const job of ["unit-test", "integration-test", "server-test", "e2e-test", "docker-build"]) {
        expect(jobBlock(job), `${job} must remain stopped after a guard failure`).not.toMatch(/always\(\)/);
    }
});
