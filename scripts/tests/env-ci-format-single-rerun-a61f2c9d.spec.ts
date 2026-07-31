import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-a61f2c9d
 *  Title   : Formatting auto-fix triggers exactly one replacement CI run
 *  Source  : docs/dev-features/env-ci-format-single-rerun-a61f2c9d.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const readWorkflow = (name: string) => fs.readFileSync(path.join(repoRoot, ".github", "workflows", name), "utf-8");

test("the formatter pushes its fix without manually dispatching a duplicate CI run", () => {
    const formatWorkflow = readWorkflow("ci-format.yml");

    expect(formatWorkflow).toMatch(/git commit -m "Auto-fix: Format code with dprint"/);
    expect(formatWorkflow).toMatch(/if git push; then/);
    expect(formatWorkflow).toMatch(/changes_pushed=true/);

    // The push updates the PR and emits `pull_request.synchronize`; explicitly
    // dispatching ci.yml here would start a second run for the same commit.
    expect(formatWorkflow).not.toMatch(/gh workflow run/);
    expect(formatWorkflow).not.toMatch(/actions\/workflows\/.*\/dispatches/);
    expect(formatWorkflow).not.toMatch(/repository_dispatch/);
});

test("the CI workflow reruns automatically when the formatter updates the PR", () => {
    const ciWorkflow = readWorkflow("ci.yml");

    expect(ciWorkflow).toMatch(/pull_request:\s*\n\s+types: \[opened, synchronize, reopened, ready_for_review\]/);
    expect(ciWorkflow).toMatch(/format:\s*\n\s+name: Format Check and Auto-Fix/);
    expect(ciWorkflow).toMatch(/uses: \.\/\.github\/workflows\/ci-format\.yml/);
});

test("the obsolete format run stops after pushing while the synchronized run does the checks", () => {
    const ciWorkflow = readWorkflow("ci.yml");
    const gatedJobs = [
        "checks",
        "unit-test",
        "integration-test",
        "server-test",
        "e2e-test",
        "docker-build",
        "yaml-tests-check",
        "lint-diff-lines",
        "playwright-version",
    ];

    for (const job of gatedJobs) {
        const start = ciWorkflow.indexOf(`  ${job}:`);
        expect(start, `${job} must exist`).toBeGreaterThanOrEqual(0);
        const nextJobPattern = /^  [a-z][a-z0-9-]*:\s*$/gm;
        nextJobPattern.lastIndex = start + job.length + 3;
        const nextJob = nextJobPattern.exec(ciWorkflow);
        const jobBlock = ciWorkflow.slice(start, nextJob?.index);
        expect(jobBlock, `${job} must stop in the obsolete run`).toMatch(
            /if: needs\.format\.outputs\.changes_pushed != 'true'/,
        );
    }
});
