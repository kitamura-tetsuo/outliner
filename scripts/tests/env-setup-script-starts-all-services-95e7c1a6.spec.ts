/** @feature ENV-0002
 *  Title   : Setup script starts all test services
 *  Source  : docs/dev-features.yaml
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const setupScript = path.join(repoRoot, "scripts", "setup.sh");
const ciE2eStartScript = path.join(repoRoot, "scripts", "ci-e2e-start.sh");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

test("setup script and CI E2E startup script start services via the shared helper", async () => {
    const setupContent = fs.readFileSync(setupScript, "utf-8");
    const ciE2eContent = fs.readFileSync(ciE2eStartScript, "utf-8");
    const commonContent = fs.readFileSync(commonFunctions, "utf-8");

    // scripts/setup.sh (dev machines) and scripts/ci-e2e-start.sh (minimal CI
    // E2E startup path) both delegate to start_and_wait_for_services, which
    // is the single place that actually runs `pm2 start ecosystem.config.cjs`.
    expect(setupContent.includes("start_and_wait_for_services")).toBe(true);
    expect(ciE2eContent.includes("start_and_wait_for_services")).toBe(true);
    expect(commonContent.includes("pm2 start")).toBe(true);
    expect(commonContent.includes("ecosystem.config.cjs")).toBe(true);
});
