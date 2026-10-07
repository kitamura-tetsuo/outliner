/** @feature ENV-6b0e8c42 */
import { describe, expect, it } from "vitest";
import { runGate, TOL } from "./fixtures/e2e-readiness-deadline/gate-helper";

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
});
