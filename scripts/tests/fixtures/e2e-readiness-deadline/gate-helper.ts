import { spawnSync } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { expect } from "vitest";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const runner = path.join(repoRoot, "scripts/tests/fixtures/e2e-readiness-deadline/run-readiness-gate.sh");

// Wall-clock scheduling tolerance (seconds) added to a test budget. Small
// enough to reject the historic failure modes (probes, recovery, or
// diagnostics running tens of seconds past the deadline) while absorbing
// ordinary CI scheduling jitter and forced-kill grace periods.
export const TOL = 8;

export async function freePort(): Promise<number> {
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

export async function runGate(
    mode: string,
    budget: number,
    opts: { slowDelay?: number; stall?: number; pm2?: string; noTimeout?: boolean; } = {},
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
            E2E_FORCE_NO_TIMEOUT: opts.noTimeout ? "1" : "0",
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
export function gateElapsed(stdout: string): number {
    const match = /deadline exceeded at (\d+)s elapsed/.exec(stdout);
    expect(match, "expected a deadline message with the gate-measured elapsed time").not.toBeNull();
    return Number(match?.[1]);
}
