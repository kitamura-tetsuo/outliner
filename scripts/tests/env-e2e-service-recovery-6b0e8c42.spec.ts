/** @feature ENV-6b0e8c42 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { runGate, TOL } from "./fixtures/e2e-readiness-deadline/gate-helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

function restarts(stdout: string): string[] {
    return [...stdout.matchAll(/^FAKE-PM2-RESTART (.+)$/gm)].map(match => match[1]);
}

describe("Bounded startup recovery (issue #5487)", () => {
    it.each([
        ["crash-yjs-recover", "yjs-server"],
        ["stall-log-recover", "log-service"],
        ["stall-vite-only", "vite-server"],
        ["stall-hosting-recover", "firebase-emulators"],
    ])("recovers %s by restarting only %s once", async (mode, owner) => {
        const result = await runGate(mode, 25, { stall: 3 });
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).toContain("All test services are ready!");
        expect(restarts(result.stdout)).toEqual([owner]);
        expect(result.elapsedSec).toBeLessThan(25 + TOL);
    }, 60000);

    it("immediately recovers a terminal log-service through the production PM2 snapshot", async () => {
        // Complete jlist: only log-service is errored and its port stays
        // closed until restart. No stall override; the budget is shorter
        // than 60s, so omitting log-service from the PM2 snapshot fails.
        const budget = 15;
        const result = await runGate("crash-log-recover", budget);
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).toContain("PM2 service log-service is in state 'errored' before readiness.");
        expect(restarts(result.stdout)).toEqual(["log-service"]);
        expect(result.stdout).toContain("All test services are ready!");
        expect(result.elapsedSec).toBeLessThan(budget + TOL);
    }, 30000);

    it("fails without another restart when a crashed service stays broken", async () => {
        const result = await runGate("crash-yjs-broken", 15);
        expect(result.status, result.stdout).toBe(1);
        expect(restarts(result.stdout)).toEqual(["yjs-server"]);
        expect(result.stdout).toContain("yjs-server(errored)");
        expect(result.stdout).not.toContain("All test services are ready!");
        expect(result.elapsedSec).toBeLessThan(15 + TOL);
    }, 60000);

    it("keeps the original deadline when an online service stays unready", async () => {
        const result = await runGate("stall-log-broken", 15, { stall: 3 });
        expect(result.status, result.stdout).toBe(1);
        expect(restarts(result.stdout)).toEqual(["log-service"]);
        expect(result.stdout).toContain("deadline exceeded");
        expect(result.stdout).toContain("Affected owning service(s): log-service");
        expect(result.stdout).not.toContain("All test services are ready!");
        expect(result.elapsedSec).toBeLessThan(15 + TOL);
    }, 60000);

    it("attributes an unhealthy Functions endpoint to firebase-emulators", async () => {
        const result = await runGate("hang-fn", 18, { stall: 3 });
        expect(result.status, result.stdout).toBe(1);
        expect(restarts(result.stdout)).toEqual(["firebase-emulators"]);
        expect(result.stdout).toContain("Firebase Function Health");
        expect(result.elapsedSec).toBeLessThan(18 + TOL);
    }, 60000);

    it("never reports success after a failed restart even if ports recover", async () => {
        const result = await runGate("crash-yjs-restart-fail", 20);
        expect(result.status, result.stdout).toBe(1);
        expect(restarts(result.stdout)).toEqual(["yjs-server"]);
        expect(result.stdout).toContain("restart failed");
        expect(result.stdout).not.toContain("All test services are ready!");
    }, 60000);

    it("does not restart services when all checks are satisfied", async () => {
        const result = await runGate("instant", 20, { stall: 1 });
        expect(result.status, result.stdout).toBe(0);
        expect(restarts(result.stdout)).toEqual([]);
    }, 60000);

    it("pins the production stall default to 60 seconds", async () => {
        // Guards the REQ-002 stall policy itself: every behavioral test
        // above overrides the threshold, so a default change (e.g. 60 to
        // 120) would stay green without this pin plus the behavioral
        // production-default run below.
        const content = fs.readFileSync(commonFunctions, "utf-8");
        expect(content).toContain("E2E_SERVICE_STALL_SECONDS:-60");
    });

    it("restarts a continuously unready service around 60s with no threshold override", async () => {
        // Production-default behavioral run (issue #5487, REQ-002): no
        // stall override, so the gate must apply the production 60s stall
        // policy — restart once around 60s and succeed within the original
        // deadline. With a regressed 120s default this budget expires with
        // no restart; with a shortened default the elapsed lower bound fails.
        const budget = 75;
        const result = await runGate("stall-log-recover", budget);
        expect(result.status, result.stdout).toBe(0);
        expect(result.stdout).toContain("All test services are ready!");
        expect(restarts(result.stdout)).toEqual(["log-service"]);
        expect(result.stdout).toContain("Restarting log-service once");
        expect(result.elapsedSec).toBeGreaterThanOrEqual(55);
        expect(result.elapsedSec).toBeLessThan(budget + TOL);
    }, 150000);

    it("never succeeds when the Functions listener closes before its health probe", async () => {
        // The Functions port passes the initial sweep (consuming the
        // single-shot listener) and is gone by the pre-health probe in the
        // same evaluation — the post-restart shape from issue #5487,
        // REQ-005. The evaluation must stay unsatisfied until a later
        // evaluation positively observes a healthy response.
        const result = await runGate("flap-fn", 15);
        expect(result.status, result.stdout).not.toBe(0);
        expect(result.stdout).toContain("Firebase Function Health");
        expect(result.stdout).not.toContain("All test services are ready!");
        expect(restarts(result.stdout)).toEqual([]);
        expect(result.elapsedSec).toBeLessThan(15 + TOL);
    }, 60000);
});
