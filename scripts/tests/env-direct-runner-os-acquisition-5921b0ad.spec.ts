/** @feature ENV-5921b0ad
 * Source: docs/dev-features/env-direct-runner-os-acquisition-5921b0ad.yaml
 * Real APT/dpkg/browser tests in disposable Ubuntu containers; no command mocks.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const image = `outliner-direct-os-regression:${process.pid}`;
let buildContext: string | undefined;
const output = (result: ReturnType<typeof spawnSync>) => `${result.stdout ?? ""}${result.stderr ?? ""}`;

beforeAll(() => {
    const docker = spawnSync("docker", ["info"], { encoding: "utf8", timeout: 10000 });
    expect(docker.error, "Docker control is required; this suite must never silently skip").toBeUndefined();
    expect(docker.status, output(docker)).toBe(0);
    buildContext = mkdtempSync(join(tmpdir(), "direct-runner-os-"));
    mkdirSync(join(buildContext, "client"));
    copyFileSync(join(root, "client/package-lock.json"), join(buildContext, "client/package-lock.json"));
    copyFileSync(join(root, "scripts/tests/fixtures/direct-runner-os/Dockerfile"), join(buildContext, "Dockerfile"));
    const build = spawnSync("docker", ["build", "-t", image, buildContext], {
        cwd: root,
        encoding: "utf8",
        timeout: 900000,
        maxBuffer: 20 * 1024 * 1024,
    });
    console.log(output(build));
    expect(build.error).toBeUndefined();
    expect(build.status).toBe(0);
}, 920000);

afterAll(() => {
    if (buildContext) rmSync(buildContext, { recursive: true, force: true });
    spawnSync("docker", ["image", "rm", "-f", image], { encoding: "utf8", timeout: 30000 });
});

function run(scenario: string, limit: number) {
    const name = `outliner-direct-os-${process.pid}-${scenario}`;
    const started = performance.now();
    const result = spawnSync("docker", [
        "run",
        "--rm",
        "--name",
        name,
        "-v",
        `${join(root, "scripts")}:/source/scripts:ro`,
        image,
        "bash",
        "/source/scripts/tests/fixtures/direct-runner-os/run-case.sh",
        scenario,
    ], { encoding: "utf8", timeout: limit, maxBuffer: 20 * 1024 * 1024 });
    const elapsed = performance.now() - started;
    console.log(`${scenario}: elapsed=${elapsed}ms exit=${result.status}\n${output(result)}`);
    if (result.error) spawnSync("docker", ["rm", "-f", name], { timeout: 10000 });
    expect(result.error, "Independent outer harness must not terminate the acquisition").toBeUndefined();
    expect(result.signal).toBeNull();
    return { result, elapsed, log: output(result) };
}

test("required packages are acquired and an independent browser actually executes", () => {
    const { result, elapsed, log } = run("success", 650000);
    expect(result.status).toBe(0);
    expect(elapsed).toBeLessThan(610000);
    expect(log).toContain("stage=ready exit=0");
    expect(log).toContain("INDEPENDENT_BROWSER_EXECUTED");
}, 660000);

for (const scenario of ["unavailable", "slow"]) {
    test(`${scenario} sources fail inside the aggregate deadline with APT evidence`, () => {
        const { result, elapsed, log } = run(scenario, 30000);
        expect(result.status).not.toBeNull();
        expect(result.status).not.toBe(0);
        expect(elapsed).toBeLessThan(18000); // 15s aggregate + container scheduling overhead
        expect(log).toContain("stage=apt-update exit=");
        expect(log).toContain("127.0.0.1");
        expect(log).toContain("Required OS package is not installed:");
        expect(log).not.toContain("stage=ready");
        if (scenario === "slow") {
            expect(elapsed).toBeGreaterThanOrEqual(9500);
            expect([124, 137]).toContain(result.status);
            expect(log).toContain("SLOW_SOURCE_REQUEST");
        } else {
            expect(log).toMatch(/Failed to fetch|Could not connect|Connection refused/);
        }
    }, 40000);
}

test("a real warm browser cache cannot hide a removed required dependency", () => {
    const { result, elapsed, log } = run("missing", 650000);
    expect(result.status).toBe(1);
    expect(elapsed).toBeLessThan(610000);
    const negativeLog = log.split("MISSING_DEPENDENCY_CONTROL")[1];
    expect(negativeLog).toContain("REAL_DOWNLOAD_ONLY_COMPLETED");
    expect(negativeLog).toContain("Required OS package is not installed: lsof");
    expect(negativeLog).not.toContain("stage=ready");
}, 660000);
