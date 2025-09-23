/** @feature ENV-f8c2d1a4
 *  Title   : Auto-coder self update for pipx installations
 *  Source  : docs/dev-features.yaml
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const workflowScript = path.join(repoRoot, "dev_workflow.py");
const pythonTest = path.join(repoRoot, "scripts", "tests", "test_auto_update.py");

test("dev_workflow.py triggers the auto-update helper", () => {
    expect(fs.existsSync(workflowScript)).toBe(true);
    const content = fs.readFileSync(workflowScript, "utf-8");
    expect(content.includes("AUTO_CODER_PIP_SPEC")).toBe(true);
    expect(content.includes("maybe_auto_update()")).toBe(true);
    expect(content.includes("AUTO_CODER_DISABLE_AUTO_UPDATE")).toBe(true);
});

test("python unit test verifies auto-update behavior", () => {
    expect(fs.existsSync(pythonTest)).toBe(true);
    const pythonTestContent = fs.readFileSync(pythonTest, "utf-8");
    expect(pythonTestContent.includes("maybe_auto_update(")).toBe(true);
    expect(pythonTestContent.includes("AUTO_CODER_DISABLE_AUTO_UPDATE")).toBe(true);
});
