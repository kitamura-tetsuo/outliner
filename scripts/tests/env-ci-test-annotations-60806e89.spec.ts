import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-0006
 *  Title   : Inline test annotations and job summary in CI
 *  Source  : docs/dev-features/env-ci-test-annotations-60806e89.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const packageJson = path.join(repoRoot, "client", "package.json");
const workflowFile = path.join(repoRoot, ".github", "workflows", "test.yml");

test("package.json includes github test scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
    expect(pkg.scripts["github:test:unit"]).toContain("--reporter=github-actions");
    expect(pkg.scripts["github:test:unit"]).toContain("--reporter=dot");
    expect(pkg.scripts["github:test:e2e"]).toContain("--reporter=github,line");
});

test("workflow runs tests with annotation reporters", () => {
    const workflow = fs.readFileSync(workflowFile, "utf-8");
    expect(workflow).toMatch(/Run unit and integration tests for github reporting/);
    expect(workflow).toMatch(/npm run github:test:unit/);
    expect(workflow).toMatch(/npm run github:test:integration/);
    expect(workflow).toMatch(/Run e2e tests for github reporting/);
    expect(workflow).toMatch(/scripts\/run-e2e-progress-for-codex\.sh 1/);
    expect(workflow).toMatch(/Summarise failures/);
});
