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

test("package.json includes github test scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
    expect(pkg.scripts["github:test:unit"]).toContain("--reporter=github-actions");
    expect(pkg.scripts["github:test:unit"]).toContain("--reporter=dot");
});

test("workflow runs tests with annotation reporters", () => {
    const workflowUnit = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci-test-unit.yml"), "utf-8");
    const workflowE2e = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci-test-e2e.yml"), "utf-8");
    const workflowIntegration = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci-test-integration.yml"), "utf-8");

    expect(workflowUnit).toMatch(/Run unit tests/);
    expect(workflowUnit).toMatch(/npm run github:test:unit/);

    expect(workflowIntegration).toMatch(/Run integration tests/);
    expect(workflowIntegration).toMatch(/npm run github:test:integration/);

    expect(workflowE2e).toMatch(/Run E2E tests/i);
    // E2E executes npm script using github reporter
    expect(workflowE2e).toMatch(/npm run github:test:e2e/);
    expect(workflowE2e).toMatch(/Summarise failures/);
});
