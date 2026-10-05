/** @feature ENV-7f3a9c2e
 *  Title   : E2E startup retries a selectively stalled hosting emulator
 *  Source  : docs/dev-features.yaml
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

describe("E2E startup hosting-emulator stall retry (PR #5453)", () => {
    it("restarts a wedged firebase-emulators process exactly once after a sustained hosting-only stall", async () => {
        const content = fs.readFileSync(commonFunctions, "utf-8");

        // The retry lives in the shared startup gate used by both
        // scripts/setup.sh and scripts/ci-e2e-start.sh.
        expect(content.includes("start_and_wait_for_services")).toBe(true);

        // Detects the observed signature: every required port open except
        // the Firebase Hosting emulator port.
        expect(content.includes("_only_hosting_missing")).toBe(true);

        // Exactly one bounded restart command within the same overall
        // deadline, not a restart loop and not a silent extension of the
        // wait. Anchored to line start so the warning echo on the same
        // line is not double-counted.
        const restartCommands = content
            .split("\n")
            .filter(line => /^\s*pm2 restart firebase-emulators\b/.test(line));
        expect(restartCommands.length).toBe(1);
        expect(content.includes("HOSTING_RESTART_DONE")).toBe(true);
    });

    it("keeps the overall deadline and surfaces emulator startup output on timeout", async () => {
        const content = fs.readFileSync(commonFunctions, "utf-8");

        // The 600s deadline still terminates the wait.
        expect(content.includes("Timeout waiting for services after")).toBe(true);

        // The startup section of the emulator log is printed, since the
        // PM2 tail alone is drowned by Functions health-check spam.
        expect(content.includes("logs/firebase-emulators.log")).toBe(true);
        expect(content.includes("head -n 80")).toBe(true);
    });
});
