import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const guardScript = path.join(repoRoot, "scripts/ci/pr-guards.sh");

const runGuards = (cwd: string, base = "") => {
    try {
        const stdout = execFileSync("bash", [guardScript], {
            cwd,
            encoding: "utf-8",
            env: { ...process.env, BASE_REF: "", PR_LABELS: "", BASE_COMMIT_OVERRIDE: base },
        });
        return { status: 0, output: stdout };
    } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string; };
        return { status: failure.status, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
};

describe("PR guards reject Python root scratch files", () => {
    let workspace: string;

    const track = (relative: string) => {
        const target = path.join(workspace, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "scratch\n");
        execFileSync("git", ["add", "-f", relative], { cwd: workspace });
    };

    beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pr-guards-py-"));
        execFileSync("git", ["init", "-q"], { cwd: workspace });
        track("README.md");
    });

    afterEach(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
    });

    test.each(["verify.py", "verify2.py", "test.py", "arbitrary_scratch.py"])("%s is rejected as debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).not.toBe(0);
        expect(result.output).toContain("[debris]");
        expect(result.output).toContain(relative);
    });

    test.each(["scripts/verify.py", "server/src/test.py"])("%s is kept: only root-level python files are debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain("no tracked debris files");
    });
});
