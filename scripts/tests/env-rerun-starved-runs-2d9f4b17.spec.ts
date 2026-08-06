import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-2d9f4b17
 *  Title   : Workflow runs starved of a hosted runner are re-queued automatically
 *  Source  : docs/dev-features/env-rerun-starved-runs-2d9f4b17.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const workflowFile = path.join(repoRoot, ".github", "workflows", "ci-rerun-starved-runs.yml");
const scriptFile = path.join(repoRoot, "scripts", "ci", "rerun-starved-run.sh");

const workflow = fs.readFileSync(workflowFile, "utf-8");

test("the watcher reacts to the top-level workflows once they conclude", () => {
    expect(workflow).toMatch(/on:\s*\n\s+workflow_run:/);
    expect(workflow).toMatch(/types: \[completed\]/);
    for (const watched of ["CI", "Uptime Monitor", "Deploy"]) {
        expect(workflow, `${watched} must be watched`).toMatch(new RegExp(`^\\s+- ${watched}$`, "m"));
    }
    // Re-queueing needs to write to the Actions API, and naming any permission
    // drops the rest to `none` -- without an explicit `contents: read` the
    // checkout that fetches the script fails before it can run.
    expect(workflow).toMatch(/permissions:\s*\n\s+actions: write\s*\n\s+contents: read/);
});

test("only failed runs are considered, so a cancelled run stays cancelled", () => {
    expect(workflow).toMatch(/if: github\.event\.workflow_run\.conclusion == 'failure'/);
    expect(workflow).not.toMatch(/conclusion == 'cancelled'/);
});

test("the watcher passes the run and its attempt number to the script", () => {
    expect(workflow).toMatch(/RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
    expect(workflow).toMatch(/RUN_ATTEMPT: \$\{\{ github\.event\.workflow_run\.run_attempt \}\}/);
    expect(workflow).toMatch(/bash scripts\/ci\/rerun-starved-run\.sh/);
});

/**
 * Drive the script with a stubbed `gh` so the starvation signature is exercised
 * without touching the network. The stub records the requests it receives.
 */
const runScript = (jobs: unknown, env: Record<string, string> = {}) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "rerun-starved-"));
    try {
        const calls = path.join(workDir, "calls.log");
        fs.writeFileSync(path.join(workDir, "jobs.json"), JSON.stringify(jobs));
        fs.writeFileSync(
            path.join(workDir, "gh"),
            `#!/usr/bin/env bash\n`
                + `printf '%s\\n' "$*" >> "${calls}"\n`
                + `if [ "$1" = "api" ] && [ "$2" != "-X" ]; then cat "${workDir}/jobs.json"; fi\n`
                + `exit 0\n`,
            { mode: 0o755 },
        );
        const stdout = execFileSync("bash", [scriptFile], {
            encoding: "utf-8",
            env: {
                ...process.env,
                PATH: `${workDir}:${process.env.PATH ?? ""}`,
                REPO: "owner/repo",
                RUN_ID: "123",
                RUN_ATTEMPT: "1",
                ...env,
            },
        });
        const log = fs.existsSync(calls) ? fs.readFileSync(calls, "utf-8") : "";
        return { stdout, log };
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
};

const job = (over: Record<string, unknown>) => ({
    name: "pr-guards",
    conclusion: "cancelled",
    runner_name: "",
    started_at: "2026-08-06T21:00:18Z",
    completed_at: "2026-08-06T21:15:21Z",
    ...over,
});

test("a job that waited out the acquisition timeout without a runner re-queues the run", () => {
    const { log } = runScript({ jobs: [job({})] });
    expect(log).toMatch(/-X POST repos\/owner\/repo\/actions\/runs\/123\/rerun-failed-jobs/);
});

test("a job that did get a runner is a real failure and is not re-queued", () => {
    const { stdout, log } = runScript({
        jobs: [job({ conclusion: "failure", runner_name: "GitHub Actions 1000207797" })],
    });
    expect(stdout).toMatch(/No job in run 123 was starved/);
    expect(log).not.toMatch(/rerun/);
});

test("a job cancelled long before the timeout is not re-queued", () => {
    // `cancel-in-progress` kills a queued job as soon as a newer commit arrives.
    const { stdout, log } = runScript({
        jobs: [job({ completed_at: "2026-08-06T21:00:41Z" })],
    });
    expect(stdout).toMatch(/No job in run 123 was starved/);
    expect(log).not.toMatch(/rerun/);
});

test("retrying stops once the attempt budget is spent", () => {
    const { stdout, log } = runScript({ jobs: [job({})] }, { RUN_ATTEMPT: "3" });
    expect(stdout).toMatch(/already used 3 of 3 attempts/);
    expect(log).not.toMatch(/rerun/);
});
