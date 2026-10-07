/** @feature ENV-9d4b7e1a
 *  Title   : E2E startup enforces a real 180-second wall-clock readiness bound
 *  Source  : docs/dev-features.yaml
 */
import { spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const runner = path.join(__dirname, "fixtures", "e2e-readiness-deadline", "run-readiness-gate.sh");
const boundsRunner = path.join(__dirname, "fixtures", "e2e-readiness-deadline", "run-observation-bounds.sh");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

// Wall-clock scheduling tolerance (seconds) added to a test budget. Small
// enough to reject the historic failure modes (probes, recovery, or
// diagnostics running tens of seconds past the deadline) while absorbing
// ordinary CI scheduling jitter and forced-kill grace periods.
const TOL = 8;

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
        });
    });
}

interface GateResult {
    status: number | null;
    stdout: string;
    elapsedSec: number;
}

async function runGate(
    mode: string,
    budget: number,
    opts: { slowDelay?: number; stall?: number; pm2?: string; } = {},
): Promise<GateResult> {
    const [yjs, api, vite, fn, auth, fstore, host, store] = await Promise.all(
        Array.from({ length: 8 }, () => freePort()),
    );
    const start = Date.now();
    const result = spawnSync("bash", [runner], {
        cwd: repoRoot,
        env: {
            ...process.env,
            REPO_ROOT: repoRoot,
            GATE_MODE: mode,
            GATE_BUDGET: String(budget),
            GATE_SLOW_DELAY: String(opts.slowDelay ?? 0),
            GATE_STALL: opts.stall === undefined ? "" : String(opts.stall),
            GATE_PM2_BEHAVIOR: opts.pm2 ?? "ok",
            P_YJS: String(yjs),
            P_API: String(api),
            P_VITE: String(vite),
            P_FN: String(fn),
            P_AUTH: String(auth),
            P_FS: String(fstore),
            P_HOST: String(host),
            P_STORE: String(store),
        },
        timeout: Math.max(60000, (budget + 30) * 1000),
        maxBuffer: 4 * 1024 * 1024,
        encoding: "utf-8",
    });
    return { status: result.status, stdout: String(result.stdout), elapsedSec: (Date.now() - start) / 1000 };
}

// Gate-measured elapsed seconds from the deadline message, excluding fixture
// setup, so the budget assertion targets the production phase itself.
function gateElapsed(stdout: string): number {
    const match = /deadline exceeded at (\d+)s elapsed/.exec(stdout);
    expect(match, "expected a deadline message with the gate-measured elapsed time").not.toBeNull();
    return Number(match?.[1]);
}

describe("E2E startup wall-clock readiness bound (issue #5486)", () => {
    it("pins the production default budget to 180 seconds", async () => {
        const content = fs.readFileSync(commonFunctions, "utf-8");
        expect(content).toContain("E2E_SERVICE_READINESS_TIMEOUT_SECONDS:-180");
    });

    it("fails within the budget when the Functions health endpoint hangs", async () => {
        // The stub accepts the connection and never responds. Before the
        // fix, the unbounded health curl held the gate inside one iteration
        // indefinitely; now the gate must fail at the 15s test budget.
        const budget = 15;
        const { status, stdout, elapsedSec } = await runGate("hang-fn", budget);
        expect(status).not.toBe(0);
        expect(stdout).toContain(`Timeout waiting for services after ${budget} seconds`);
        expect(stdout).toContain("Firebase Function Health");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        // Gate-measured time must land on the budget, not seconds past it.
        const gate = gateElapsed(stdout);
        expect(gate).toBeGreaterThanOrEqual(budget);
        expect(gate).toBeLessThanOrEqual(budget + 3);
        // Wall clock covers fixture setup plus the gate: near the budget.
        expect(elapsedSec).toBeGreaterThanOrEqual(budget - 3);
        expect(elapsedSec).toBeLessThan(budget + TOL);
    }, 60000);

    it("treats a timed-out 200-header Functions response as unready", async () => {
        // The stub sends HTTP 200 headers with a declared body and then
        // never sends it. Curl already knows the 200 code when its body
        // read times out, so checking only the code would accept this
        // stalled endpoint as healthy.
        const budget = 12;
        const { status, stdout, elapsedSec } = await runGate("partial-fn", budget);
        expect(status).not.toBe(0);
        expect(stdout).toContain(`Timeout waiting for services after ${budget} seconds`);
        expect(stdout).toContain("Firebase Function Health");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        expect(stdout).not.toContain("All test services are ready!");
        const gate = gateElapsed(stdout);
        expect(gate).toBeGreaterThanOrEqual(budget);
        expect(gate).toBeLessThanOrEqual(budget + 3);
        expect(elapsedSec).toBeLessThan(budget + TOL);
    }, 60000);

    it("succeeds when every service becomes ready within the budget", async () => {
        const { status, stdout } = await runGate("instant", 30);
        expect(status).toBe(0);
        expect(stdout).toContain("All test services are ready!");
    }, 60000);

    it("succeeds for slow-but-recoverable startup before the deadline", async () => {
        // Mirrors the observed 151s successful case at small scale: the
        // Functions endpoint is unhealthy for 6s, then recovers well before
        // the 30s test budget, so the gate must succeed rather than cut off.
        const { status, stdout } = await runGate("slow-fn", 30, { slowDelay: 6 });
        expect(status).toBe(0);
        expect(stdout).toContain("All test services are ready!");
    }, 60000);

    it("fails instead of succeeding late when recovery lands past the budget", async () => {
        // The endpoint only becomes healthy after the budget expires. The
        // gate must fail at the deadline rather than report late success.
        const budget = 12;
        const { status, stdout, elapsedSec } = await runGate("slow-fn", budget, { slowDelay: budget + 5 });
        expect(status).not.toBe(0);
        expect(stdout).toContain(`Timeout waiting for services after ${budget} seconds`);
        expect(stdout).not.toContain("All test services are ready!");
        const gate = gateElapsed(stdout);
        expect(gate).toBeGreaterThanOrEqual(budget);
        expect(gate).toBeLessThanOrEqual(budget + 3);
        expect(elapsedSec).toBeLessThan(budget + TOL);
    }, 60000);

    it("fails within the budget when the hosting-stall recovery hangs", async () => {
        // Exercises the exact shared start_and_wait_for_services recovery
        // branch: every port except hosting is open, so after the scaled
        // 3s stall threshold the gate runs `pm2 restart`, whose sleep runs
        // past the 20s budget. The bounded restart must be killed and the
        // gate must fail at the budget naming the hosting check, without
        // extending the single wall-clock budget.
        const budget = 20;
        const { status, stdout, elapsedSec } = await runGate("hang-restart", budget, { stall: 3 });
        expect(status).not.toBe(0);
        expect(stdout).toContain("Restarting firebase-emulators once");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        expect(stdout).toMatch(/Port \d+/);
        const gate = gateElapsed(stdout);
        expect(gate).toBeGreaterThanOrEqual(budget);
        expect(gate).toBeLessThanOrEqual(budget + 3);
        expect(elapsedSec).toBeGreaterThanOrEqual(budget - 3);
        expect(elapsedSec).toBeLessThan(budget + TOL);
    }, 90000);

    it("fails within the budget when supervision start hangs", async () => {
        // Exercises the exact shared start_and_wait_for_services supervision
        // start: the `pm2 start` sleep runs past the 15s budget. The clock
        // starts before supervision, so the bounded start must be killed and
        // the gate must fail at the budget instead of holding the phase
        // outside it, with no fresh diagnostic budgets past expiry.
        const budget = 15;
        const { status, stdout, elapsedSec } = await runGate("hang-start", budget);
        expect(status).not.toBe(0);
        expect(stdout).toContain("Failed to start PM2-managed services");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        expect(stdout).toContain("Post-deadline process diagnostics skipped");
        const gate = gateElapsed(stdout);
        expect(gate).toBeGreaterThanOrEqual(budget);
        expect(gate).toBeLessThanOrEqual(budget + 3);
        expect(elapsedSec).toBeGreaterThanOrEqual(budget - 3);
        expect(elapsedSec).toBeLessThan(budget + TOL);
    }, 90000);

    it.each(["jlist-fail", "jlist-malformed", "jlist-missing"])(
        "refuses startup success when PM2 evidence is %s",
        async (pm2) => {
            // All endpoints are healthy; only the pm2 jlist observation is
            // broken. Unavailable process-state evidence must prevent
            // startup success rather than failing open.
            const { status, stdout } = await runGate("instant", 15, { pm2 });
            expect(status).not.toBe(0);
            expect(stdout).not.toContain("All test services are ready!");
        },
        60000,
    );

    it("bounds a PM2 observation that ignores SIGTERM", async () => {
        // `pm2 jlist` ignores SIGTERM and never completes. The hard-bound
        // observation must still return, and the gate must fail fast on the
        // unobservable daemon instead of holding the phase.
        const start = Date.now();
        const { status, stdout } = await runGate("instant", 15, { pm2: "jlist-trap-term" });
        const elapsedSec = (Date.now() - start) / 1000;
        expect(status).not.toBe(0);
        expect(stdout).toContain("Detected crashed services");
        expect(stdout).not.toContain("All test services are ready!");
        expect(elapsedSec).toBeLessThan(5 + TOL);
    }, 60000);

    it("bounds the lsof fallback and the no-timeout watchdog", async () => {
        // Direct observation probes: a hanging TERM-ignoring lsof must be
        // reaped inside the probe bound (forced kill), and a TERM-ignoring
        // command must still be stopped when GNU timeout is unavailable.
        const closed = await freePort();
        const start = Date.now();
        const result = spawnSync("bash", [boundsRunner], {
            cwd: repoRoot,
            env: { ...process.env, REPO_ROOT: repoRoot, BOUND_PROBE: "3", CLOSED_PORT: String(closed) },
            timeout: 60000,
            maxBuffer: 4 * 1024 * 1024,
            encoding: "utf-8",
        });
        const elapsedSec = (Date.now() - start) / 1000;
        expect(String(result.stdout)).toContain("ALL OBSERVATION BOUNDS HELD");
        expect(result.status).toBe(0);
        expect(elapsedSec).toBeLessThan(30);
    }, 90000);
});
