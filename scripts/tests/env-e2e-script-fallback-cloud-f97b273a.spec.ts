import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-0011
 *  Title   : E2E script fallback when not in cloud environment
 *  Source  : docs/dev-features/env-e2e-script-fallback-f97b273a.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const scriptFile = path.join(repoRoot, "scripts", "run-e2e-progress.sh");

// Ensure script contains environment check and fallback command

test("run-e2e-progress.sh includes CLOUD_ENV check", () => {
    const content = fs.readFileSync(scriptFile, "utf-8");
    expect(content).toMatch(/CLOUD_ENV/);
    expect(content).toMatch(/github:test:e2e/);
});
