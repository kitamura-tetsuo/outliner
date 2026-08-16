import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** @feature ENV-2e513660
 *  Title   : PR guards reject committed agent plan files
 *  Source  : docs/dev-features/env-pr-guards-reject-plan-files-2e513660.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const guardScript = path.join(repoRoot, "scripts/ci/pr-guards.sh");

/** Runs the guard script (debris guard only: BASE_REF empty) against `cwd`. */
const runGuards = (cwd: string) => {
    try {
        const stdout = execFileSync("bash", [guardScript], {
            cwd,
            encoding: "utf-8",
            env: { ...process.env, BASE_REF: "", PR_LABELS: "" },
        });
        return { status: 0, output: stdout };
    } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string; };
        return { status: failure.status, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
};

describe("PR guards reject agent plan files", () => {
    let workspace: string;

    const track = (relative: string) => {
        const target = path.join(workspace, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "scratch\n");
        execFileSync("git", ["add", "-f", relative], { cwd: workspace });
    };

    beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pr-guards-plan-"));
        execFileSync("git", ["init", "-q"], { cwd: workspace });
        track("README.md");
    });

    afterEach(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
    });

    test.each([
        "plan.md",
        "plan.txt",
        "PLAN.md",
        "plans.md",
        "plan_page-titles.md",
        "plan-2.txt",
    ])("%s is rejected as debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).not.toBe(0);
        expect(result.output).toContain("[debris]");
        expect(result.output).toContain(relative);
    });

    test.each([
        "docs/plan.md",
        "client/src/lib/planner.md",
        "explanation.md",
    ])("%s is kept: only root-level plan files are debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain("no tracked debris files");
    });

    test("the repository tree carries no plan files", () => {
        const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf-8" })
            .split("\n")
            .filter(file => /^[Pp][Ll][Aa][Nn][Ss]?([_-][^/]*)?\.(md|txt)$/.test(file));

        expect(tracked).toEqual([]);
    });

    test(".gitignore keeps plan files out of the working tree", () => {
        const ignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf-8");

        expect(ignore).toContain("/plan.md");
        expect(ignore).toContain("/plan.txt");
    });
});
