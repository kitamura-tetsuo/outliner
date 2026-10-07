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
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

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

async function runGate(mode: string, budget: number, slowDelay = 0, stall?: number) {
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
            GATE_SLOW_DELAY: String(slowDelay),
            GATE_STALL: stall === undefined ? "" : String(stall),
            P_YJS: String(yjs),
            P_API: String(api),
            P_VITE: String(vite),
            P_FN: String(fn),
            P_AUTH: String(auth),
            P_FS: String(fstore),
            P_HOST: String(host),
            P_STORE: String(store),
        },
        timeout: 50000,
        maxBuffer: 4 * 1024 * 1024,
        encoding: "utf-8",
    });
    return { status: result.status, stdout: String(result.stdout), elapsedSec: (Date.now() - start) / 1000 };
}

describe("E2E startup wall-clock readiness bound (issue #5486)", () => {
    it("pins the production default budget to 180 seconds", async () => {
        const content = fs.readFileSync(commonFunctions, "utf-8");
        expect(content).toContain("E2E_SERVICE_READINESS_TIMEOUT_SECONDS:-180");
    });

    it("fails within the budget when the Functions health endpoint hangs", async () => {
        // The stub accepts the connection and never responds. Before the
        // fix, the unbounded health curl held the gate inside one iteration
        // indefinitely; now the gate must fail near the 15s test budget.
        const { status, stdout, elapsedSec } = await runGate("hang-fn", 15);
        expect(status).not.toBe(0);
        expect(stdout).toContain("Timeout waiting for services after 15 seconds");
        expect(stdout).toContain("Firebase Function Health");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        // Waited out (close to) the full budget instead of failing instantly...
        expect(elapsedSec).toBeGreaterThanOrEqual(12);
        // ...but never held past it the way the unbounded probe did.
        expect(elapsedSec).toBeLessThan(50);
    }, 54000);

    it("succeeds when every service becomes ready within the budget", async () => {
        const { status, stdout } = await runGate("instant", 30);
        expect(status).toBe(0);
        expect(stdout).toContain("All test services are ready!");
    }, 54000);

    it("succeeds for slow-but-recoverable startup before the deadline", async () => {
        // Mirrors the observed 151s successful case at small scale: the
        // Functions endpoint is unhealthy for 6s, then recovers well before
        // the 30s test budget, so the gate must succeed rather than cut off.
        const { status, stdout } = await runGate("slow-fn", 30, 6);
        expect(status).toBe(0);
        expect(stdout).toContain("All test services are ready!");
    }, 54000);

    it("fails within the budget when the hosting-stall recovery hangs", async () => {
        // Exercises the exact shared start_and_wait_for_services recovery
        // branch: every port except hosting is open, so after the scaled
        // 3s stall threshold the gate runs `pm2 restart`, whose double
        // sleeps past the 20s budget. The bounded restart must be killed
        // and the gate must fail near the budget naming the hosting check,
        // without extending the single wall-clock budget.
        const { status, stdout, elapsedSec } = await runGate("hang-restart", 20, 0, 3);
        expect(status).not.toBe(0);
        expect(stdout).toContain("Restarting firebase-emulators once");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        expect(stdout).toMatch(/Port \d+/);
        expect(elapsedSec).toBeGreaterThanOrEqual(15);
        expect(elapsedSec).toBeLessThan(60);
    }, 90000);

    it("fails within the budget when supervision start hangs", async () => {
        // Exercises the exact shared start_and_wait_for_services supervision
        // start: the `pm2 start` double sleeps past the 15s budget. The
        // clock starts before supervision, so the bounded start must be
        // killed and the gate must fail near the budget instead of holding
        // the phase outside it.
        const { status, stdout, elapsedSec } = await runGate("hang-start", 15);
        expect(status).not.toBe(0);
        expect(stdout).toContain("Failed to start PM2-managed services");
        expect(stdout).toContain("Readiness checks still unsatisfied:");
        expect(elapsedSec).toBeGreaterThanOrEqual(12);
        expect(elapsedSec).toBeLessThan(60);
    }, 90000);
});
