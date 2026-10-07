/** @feature ENV-6b0e8c42 */
import { describe, expect, it } from "vitest";
import { gateElapsed, runGate } from "./fixtures/e2e-readiness-deadline/gate-helper";

function restarts(stdout: string): string[] {
    return [...stdout.matchAll(/^FAKE-PM2-RESTART (.+)$/gm)].map(match => match[1]);
}

describe("Startup recovery fails closed within its deadline (issue #5487 REQ-005)", () => {
    it.each([false, true])("kills a late TERM-ignoring restart inside the budget (watchdog=%s)", async (noTimeout) => {
        // The real supervisor receives a positive terminal PM2 observation
        // with exactly one second left. All endpoints are healthy, but
        // recovery execs a TERM-ignoring process. Neither timeout path may
        // add its normal two-second termination grace to the deadline.
        const budget = 4;
        const result = await runGate("late-hang-restart", budget, { noTimeout });
        expect(result.status, result.stdout).toBe(1);
        expect(restarts(result.stdout)).toEqual(["yjs-server"]);
        expect(result.stdout).toContain("RESTART_REMAINING=1");
        expect(result.stdout).toContain("RESTART_PROCESS_TERMINATED");
        expect(result.stdout).not.toContain("RESTART_PROCESS_SURVIVED");
        expect(result.stdout).not.toContain("All test services are ready!");
        expect(result.stdout).toContain("Automatic restarts attempted: yjs-server");
        expect(gateElapsed(result.stdout)).toBe(budget);
        const finish = /^GATE_FINISH_NS=(\d+)$/m.exec(result.stdout);
        const deadline = /^GATE_DEADLINE=(\d+)$/m.exec(result.stdout);
        expect(finish).not.toBeNull();
        expect(deadline).not.toBeNull();
        // Allow subsecond scheduling/reaping overhead, never the former
        // two-second grace. Epoch deadline excludes fixture setup time.
        expect(Number(finish?.[1]) / 1e9 - Number(deadline?.[1])).toBeLessThan(0.75);
    }, 30000);

    it("keeps Yjs unsatisfied when its restarted listener disappears after the port sweep", async () => {
        const budget = 12;
        const result = await runGate("crash-yjs-flap", budget);
        expect(result.status, result.stdout).toBe(1);
        expect(restarts(result.stdout)).toEqual(["yjs-server"]);
        expect(result.stdout).toContain("Restarted yjs-server (automatic recovery)");
        expect(result.stdout).toMatch(/Yjs WebSocket \(port \d+ unavailable\)/);
        expect(result.stdout).toContain("Affected owning service(s): yjs-server");
        expect(result.stdout).not.toContain("All test services are ready!");
        expect(gateElapsed(result.stdout)).toBe(budget);
    }, 30000);
});
