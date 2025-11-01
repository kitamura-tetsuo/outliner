import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-0011
 *  Title   : Codex e2e progress script fallback
 *  Source  : docs/dev-features/env-e2e-progress-fallback-717fb3c8.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const scriptFile = path.join(repoRoot, "scripts", "run-e2e-progress.sh");

test("script falls back to GitHub E2E tests outside Codex", () => {
    const content = fs.readFileSync(scriptFile, "utf-8");
    expect(content).toMatch(/CODEX_ENV_NODE_VERSION/);
    expect(content).toMatch(/github:test:e2e/);
});
