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
const e2eWorkflowFile = path.join(repoRoot, ".github", "workflows", "ci-test-e2e.yml");
const unitWorkflowFile = path.join(repoRoot, ".github", "workflows", "ci-test-unit.yml");
const integrationWorkflowFile = path.join(repoRoot, ".github", "workflows", "ci-test-integration.yml");

test("package.json includes github test scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf-8"));
    expect(pkg.scripts["github:test:unit"]).toContain("--reporter=github-actions");
    expect(pkg.scripts["github:test:unit"]).toContain("--reporter=dot");
    expect(pkg.scripts["github:test:integration"]).toContain("--reporter=github-actions");
    expect(pkg.scripts["github:test:e2e"]).toContain("--reporter=github,line");
});

test("workflow runs tests with annotation reporters", () => {
    const e2eWorkflow = fs.readFileSync(e2eWorkflowFile, "utf-8");
    const unitWorkflow = fs.readFileSync(unitWorkflowFile, "utf-8");
    const integrationWorkflow = fs.readFileSync(integrationWorkflowFile, "utf-8");

    expect(unitWorkflow).toMatch(/npm run github:test:unit/);
    expect(integrationWorkflow).toMatch(/npm run github:test:integration/);
    expect(e2eWorkflow).toMatch(/npm run github:test:e2e/);
});
