/** @feature ENV-7f3a9c2e
 *  Title   : E2E startup retries a selectively stalled hosting emulator
 *  Source  : docs/dev-features.yaml
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { runGate, TOL } from "./fixtures/e2e-readiness-deadline/gate-helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

describe("E2E startup hosting-emulator stall retry (PR #5453)", () => {
    it("restarts a wedged firebase-emulators process exactly once after a sustained hosting-only stall", async () => {
        const { status, stdout, elapsedSec } = await runGate("stall-hosting-recover", 25, { stall: 3 });
        expect(status, stdout).toBe(0);
        expect(stdout).toContain("All test services are ready!");
        expect([...stdout.matchAll(/^FAKE-PM2-RESTART (.+)$/gm)].map(match => match[1]))
            .toEqual(["firebase-emulators"]);
        expect(elapsedSec).toBeLessThan(25 + TOL);
    });

    it("keeps the overall deadline and surfaces emulator startup output on timeout", async () => {
        const content = fs.readFileSync(commonFunctions, "utf-8");

        // The shared startup deadline still terminates the wait.
        expect(content.includes("Timeout waiting for services after")).toBe(true);

        // The startup section of the emulator log is printed, since the
        // PM2 tail alone is drowned by Functions health-check spam.
        expect(content.includes("logs/firebase-emulators.log")).toBe(true);
        expect(content.includes("head -n 80")).toBe(true);
    });
});
